"""Tests for the Login endpoint (POST /api/v1/login/).

Story FE-1.5: Authenticating with email and password returns an access/refresh
JWT pair, with rate limiting ('5/minute') to mitigate brute-force attacks.
"""

from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.tokens import AccessToken

from apps.core.tests.helpers import ENVELOPE_KEYS, assert_envelope
from apps.users.models import User


class LoginEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse('login')
        self.email = 'student@example.com'
        self.password = 'super-secret-password-123!'
        self.user = User.objects.create_user(
            email=self.email,
            password=self.password,
            is_email_verified=True,
        )

    def test_login_success_student(self):
        response = self.client.post(
            self.url,
            {'email': self.email, 'password': self.password},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('access', data)
        self.assertIn('refresh', data)

        token = AccessToken(data['access'])
        self.assertEqual(token['user_id'], str(self.user.id))

        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_login)

    def test_login_success_publisher(self):
        publisher = User.objects.create_user(
            email='publisher@example.com',
            password='publisher-password-456!',
            is_email_verified=True,
            is_publisher=True,
        )
        response = self.client.post(
            self.url,
            {'email': 'publisher@example.com', 'password': 'publisher-password-456!'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('access', data)
        self.assertIn('refresh', data)

        token = AccessToken(data['access'])
        self.assertEqual(token['user_id'], str(publisher.id))

    def test_login_normalizes_email(self):
        response = self.client.post(
            self.url,
            {'email': '   STUDENT@EXAMPLE.COM   ', 'password': self.password},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('access', data)

    def test_login_invalid_password(self):
        response = self.client.post(
            self.url,
            {'email': self.email, 'password': 'wrong-password'},
            format='json',
        )
        assert_envelope(self, response, 'unauthenticated', status.HTTP_401_UNAUTHORIZED)

    def test_login_unregistered_email(self):
        response = self.client.post(
            self.url,
            {'email': 'nonexistent@example.com', 'password': self.password},
            format='json',
        )
        assert_envelope(self, response, 'unauthenticated', status.HTTP_401_UNAUTHORIZED)

    def test_login_inactive_account(self):
        User.objects.create_user(
            email='inactive@example.com',
            password=self.password,
            is_active=False,
            is_email_verified=True,
        )
        response = self.client.post(
            self.url,
            {'email': 'inactive@example.com', 'password': self.password},
            format='json',
        )
        assert_envelope(self, response, 'unauthenticated', status.HTTP_401_UNAUTHORIZED)

    def test_login_missing_fields(self):
        response = self.client.post(
            self.url,
            {'email': ''},
            format='json',
        )
        assert_envelope(self, response, 'validation_error', status.HTTP_400_BAD_REQUEST)

    def test_login_method_not_allowed(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class LoginThrottlingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse('login')
        self.email = 'student@example.com'
        self.password = 'super-secret-password-123!'
        self.user = User.objects.create_user(
            email=self.email,
            password=self.password,
            is_email_verified=True,
        )

        original_rates = SimpleRateThrottle.THROTTLE_RATES
        self.addCleanup(
            setattr, SimpleRateThrottle, 'THROTTLE_RATES', original_rates
        )
        SimpleRateThrottle.THROTTLE_RATES = {**original_rates, 'login': '5/minute'}
        cache.clear()
        self.addCleanup(cache.clear)

    def test_login_throttled_after_5_requests(self):
        for i in range(5):
            res = self.client.post(
                self.url,
                {'email': self.email, 'password': 'wrong-password'},
                format='json',
            )
            self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        # 6th attempt in the same minute should be throttled
        res = self.client.post(
            self.url,
            {'email': self.email, 'password': 'wrong-password'},
            format='json',
        )
        assert_envelope(self, res, 'throttled', status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn('Retry-After', res.headers)
        self.assertGreaterEqual(int(res.headers['Retry-After']), 0)
