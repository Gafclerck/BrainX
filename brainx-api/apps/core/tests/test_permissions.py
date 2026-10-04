"""Tests for the write permission gate IsPublisher and privilege boundary enforcement.

These tests prove:
1. `IsPublisher` unit behavior: defensive handling of anonymous/missing users,
   non-inspection of HTTP methods, and delegation in `has_object_permission`.
2. HTTP integration: 401 unauthenticated and 403 permission denied using standard
   RFC 9457 error envelopes for mutating actions and publisher-only read views.
3. Viewset action-level permission dispatch: mutating actions require
   `[IsAuthenticated, IsPublisher]` while read actions require
   `[IsAuthenticated, IsVerifiedAccount]`.
4. Privilege isolation: `is_publisher` is structurally absent from writable
   serializers and public endpoints, and cannot be set or read via the API.
"""

from types import SimpleNamespace
import uuid

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.db import models
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import include, path, reverse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.routers import DefaultRouter
from rest_framework.test import APIClient
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken

from apps.core.exceptions import TITLES
from apps.core.permissions import IsPublisher, IsVerifiedAccount
from apps.users.models import User
from apps.users.serializers import (
    AccountStateSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegistrationSerializer,
)
from config.urls import urlpatterns as base_urlpatterns

ENVELOPE_KEYS = ('type', 'title', 'status', 'detail', 'errors')

STUDENT_EMAIL = 'student@example.com'
PUBLISHER_EMAIL = 'publisher@example.com'
UNVERIFIED_EMAIL = 'unverified@example.com'
REGISTRATION_PASSWORD = 'quixotic-marmalade-93'


def assert_envelope(test_case, response, expected_type, expected_status):
    """Assert response matches the standard 5-key RFC 9457 error envelope."""
    body = response.json()
    test_case.assertEqual(sorted(body), sorted(ENVELOPE_KEYS))
    test_case.assertEqual(body['type'], expected_type)
    test_case.assertEqual(body['title'], TITLES[expected_type])
    test_case.assertEqual(body['status'], expected_status)
    test_case.assertEqual(response.status_code, expected_status)
    test_case.assertTrue(body['detail'])
    test_case.assertIsInstance(body['errors'], dict)
    test_case.assertTrue(response['Content-Type'].startswith('application/json'))
    return body


# ---------------------------------------------------------------------------
# Test Views for HTTP integration & ViewSet permission dispatch
# ---------------------------------------------------------------------------

class MutatingActionTestView(APIView):
    """A view requiring authentication and publisher privilege for mutations."""

    permission_classes = [IsAuthenticated, IsPublisher]

    def post(self, request):
        return Response({'status': 'created'}, status=status.HTTP_201_CREATED)

    def put(self, request):
        return Response({'status': 'updated'}, status=status.HTTP_200_OK)

    def delete(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublisherOnlyReadTestView(APIView):
    """A publisher-only read view (e.g. aggregate query view) requiring IsPublisher."""

    permission_classes = [IsAuthenticated, IsPublisher]

    def get(self, request):
        return Response(
            {'aggregate': 'publisher_metrics'}, status=status.HTTP_200_OK
        )


class ContentTestViewSet(viewsets.GenericViewSet):
    """Stand-in for content viewsets tested against AC 1 and AC 4."""

    def get_permissions(self):
        if self.action in (
            'create',
            'update',
            'partial_update',
            'destroy',
            'reorder',
            'publish',
        ):
            return [IsAuthenticated(), IsPublisher()]
        return [IsAuthenticated(), IsVerifiedAccount()]

    def list(self, request):
        return Response({'action': 'list'}, status=status.HTTP_200_OK)

    def retrieve(self, request, pk=None):
        self.check_object_permissions(request, object())
        return Response({'action': 'retrieve', 'pk': pk}, status=status.HTTP_200_OK)

    def create(self, request):
        return Response({'action': 'create'}, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        self.check_object_permissions(request, object())
        return Response({'action': 'update', 'pk': pk}, status=status.HTTP_200_OK)

    def partial_update(self, request, pk=None):
        self.check_object_permissions(request, object())
        return Response({'action': 'partial_update', 'pk': pk}, status=status.HTTP_200_OK)

    def destroy(self, request, pk=None):
        self.check_object_permissions(request, object())
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def reorder(self, request, pk=None):
        self.check_object_permissions(request, object())
        return Response({'action': 'reorder', 'pk': pk}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        self.check_object_permissions(request, object())
        return Response({'action': 'publish', 'pk': pk}, status=status.HTTP_200_OK)


router = DefaultRouter()
router.register('content', ContentTestViewSet, basename='content')

urlpatterns = [
    path('test-action/', MutatingActionTestView.as_view(), name='test-action'),
    path(
        'test-publisher-read/',
        PublisherOnlyReadTestView.as_view(),
        name='test-publisher-read',
    ),
    path('', include(router.urls)),
    *base_urlpatterns,
]

TEST_SETTINGS = override_settings(ROOT_URLCONF=__name__)


# ---------------------------------------------------------------------------
# Unit Tests
# ---------------------------------------------------------------------------

class IsPublisherUnitTests(SimpleTestCase):
    """Direct unit tests for the IsPublisher permission class."""

    def setUp(self):
        self.permission = IsPublisher()
        self.view = SimpleNamespace()

    def make_request(self, user=None, method='POST'):
        return SimpleNamespace(user=user, method=method)

    def test_returns_true_for_authenticated_publisher(self):
        user = SimpleNamespace(is_anonymous=False, is_publisher=True)
        request = self.make_request(user=user)
        self.assertTrue(self.permission.has_permission(request, self.view))

    def test_returns_false_for_authenticated_non_publisher(self):
        user = SimpleNamespace(is_anonymous=False, is_publisher=False)
        request = self.make_request(user=user)
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_returns_false_when_user_is_none(self):
        request = self.make_request(user=None)
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_returns_false_when_user_is_anonymous(self):
        request = self.make_request(user=AnonymousUser())
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_returns_false_when_user_lacks_is_publisher_attribute(self):
        # Defensively guarded with getattr(user, 'is_publisher', False)
        user = SimpleNamespace(is_anonymous=False)
        request = self.make_request(user=user)
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_returns_false_when_is_publisher_is_falsy(self):
        for falsy_val in (0, '', None, [], {}):
            with self.subTest(val=falsy_val):
                user = SimpleNamespace(is_anonymous=False, is_publisher=falsy_val)
                request = self.make_request(user=user)
                self.assertFalse(self.permission.has_permission(request, self.view))

    def test_has_object_permission_delegates_to_has_permission(self):
        publisher = SimpleNamespace(is_anonymous=False, is_publisher=True)
        student = SimpleNamespace(is_anonymous=False, is_publisher=False)
        anon = AnonymousUser()

        obj = SimpleNamespace()

        self.assertTrue(
            self.permission.has_object_permission(
                self.make_request(user=publisher), self.view, obj
            )
        )
        self.assertFalse(
            self.permission.has_object_permission(
                self.make_request(user=student), self.view, obj
            )
        )
        self.assertFalse(
            self.permission.has_object_permission(
                self.make_request(user=anon), self.view, obj
            )
        )

    def test_does_not_inspect_http_methods(self):
        # IsPublisher answers only whether caller is a publisher, without method sniffing
        methods = ('GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE')
        student = SimpleNamespace(is_anonymous=False, is_publisher=False)
        publisher = SimpleNamespace(is_anonymous=False, is_publisher=True)

        for method in methods:
            with self.subTest(method=method, role='student'):
                req = self.make_request(user=student, method=method)
                self.assertFalse(self.permission.has_permission(req, self.view))

            with self.subTest(method=method, role='publisher'):
                req = self.make_request(user=publisher, method=method)
                self.assertTrue(self.permission.has_permission(req, self.view))

    def test_unverified_publisher_permission_orthogonality(self):
        # IsPublisher and IsVerifiedAccount are orthogonal: an unverified publisher
        # satisfies IsPublisher (returns True) but fails IsVerifiedAccount (returns False).
        user = SimpleNamespace(
            is_anonymous=False, is_publisher=True, is_email_verified=False
        )
        request = self.make_request(user=user)
        self.assertTrue(IsPublisher().has_permission(request, self.view))
        self.assertFalse(IsVerifiedAccount().has_permission(request, self.view))


# ---------------------------------------------------------------------------
# Integration Tests with HTTP and RFC 9457 error contracts
# ---------------------------------------------------------------------------

@TEST_SETTINGS
class IsPublisherIntegrationTests(TestCase):
    """HTTP integration tests verifying error contracts and access control."""

    def setUp(self):
        self.client = APIClient()
        self.publisher = User.objects.create_user(
            email=PUBLISHER_EMAIL,
            password=None,
            is_email_verified=True,
            is_publisher=True,
        )
        self.student = User.objects.create_user(
            email=STUDENT_EMAIL,
            password=None,
            is_email_verified=True,
            is_publisher=False,
        )
        self.unverified_student = User.objects.create_user(
            email=UNVERIFIED_EMAIL,
            password=None,
            is_email_verified=False,
            is_publisher=False,
        )

    def authenticate_as(self, user):
        token = str(AccessToken.for_user(user))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_mutating_request_by_publisher_succeeds(self):
        self.authenticate_as(self.publisher)
        response = self.client.post('/test-action/', format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {'status': 'created'})

    def test_mutating_request_by_student_returns_403_rfc9457(self):
        self.authenticate_as(self.student)
        response = self.client.post('/test-action/', format='json')
        body = assert_envelope(self, response, 'permission_denied', 403)
        self.assertEqual(
            body['detail'], str(PermissionDenied.default_detail)
        )
        self.assertEqual(body['errors'], {})

    def test_mutating_request_by_unverified_student_returns_403_rfc9457(self):
        self.authenticate_as(self.unverified_student)
        response = self.client.post('/test-action/', format='json')
        body = assert_envelope(self, response, 'permission_denied', 403)
        self.assertEqual(
            body['detail'], str(PermissionDenied.default_detail)
        )

    def test_mutating_request_by_anonymous_returns_401_rfc9457(self):
        self.client.credentials()  # No Authorization header
        response = self.client.post('/test-action/', format='json')
        body = assert_envelope(self, response, 'unauthenticated', 401)
        self.assertEqual(
            body['detail'], str(NotAuthenticated.default_detail)
        )
        self.assertEqual(body['errors'], {})

    def test_mutating_request_with_invalid_jwt_returns_401_rfc9457(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer invalid.jwt.token')
        response = self.client.post('/test-action/', format='json')
        assert_envelope(self, response, 'unauthenticated', 401)

    def test_mutating_request_with_missing_account_jwt_returns_401_rfc9457(self):
        forged = AccessToken()
        forged[settings.SIMPLE_JWT['USER_ID_CLAIM']] = str(uuid.uuid4())
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(forged)}')
        response = self.client.post('/test-action/', format='json')
        assert_envelope(self, response, 'unauthenticated', 401)

    def test_publisher_only_read_view_by_publisher_succeeds(self):
        self.authenticate_as(self.publisher)
        response = self.client.get('/test-publisher-read/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'aggregate': 'publisher_metrics'})

    def test_publisher_only_read_view_by_student_returns_403_rfc9457(self):
        self.authenticate_as(self.student)
        response = self.client.get('/test-publisher-read/')
        body = assert_envelope(self, response, 'permission_denied', 403)
        self.assertEqual(
            body['detail'], str(PermissionDenied.default_detail)
        )

    def test_publisher_only_read_view_by_anonymous_returns_401_rfc9457(self):
        self.client.credentials()
        response = self.client.get('/test-publisher-read/')
        assert_envelope(self, response, 'unauthenticated', 401)


# ---------------------------------------------------------------------------
# ViewSet Action-Level Permission Dispatch Tests
# ---------------------------------------------------------------------------

@TEST_SETTINGS
class ViewSetActionPermissionDispatchTests(TestCase):
    """Verify action-level permission dispatch conforming to AC 1 and AC 4."""

    def setUp(self):
        self.client = APIClient()
        self.publisher = User.objects.create_user(
            email=PUBLISHER_EMAIL,
            password=None,
            is_email_verified=True,
            is_publisher=True,
        )
        self.student = User.objects.create_user(
            email=STUDENT_EMAIL,
            password=None,
            is_email_verified=True,
            is_publisher=False,
        )
        self.unverified_student = User.objects.create_user(
            email=UNVERIFIED_EMAIL,
            password=None,
            is_email_verified=False,
            is_publisher=False,
        )

    def authenticate_as(self, user):
        token = str(AccessToken.for_user(user))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_verified_student_can_read_content(self):
        self.authenticate_as(self.student)
        list_resp = self.client.get('/content/')
        self.assertEqual(list_resp.status_code, 200)
        self.assertEqual(list_resp.json(), {'action': 'list'})

        detail_resp = self.client.get('/content/item-1/')
        self.assertEqual(detail_resp.status_code, 200)
        self.assertEqual(detail_resp.json(), {'action': 'retrieve', 'pk': 'item-1'})

    def test_unverified_student_cannot_read_content(self):
        self.authenticate_as(self.unverified_student)
        list_resp = self.client.get('/content/')
        assert_envelope(self, list_resp, 'permission_denied', 403)

        detail_resp = self.client.get('/content/item-1/')
        assert_envelope(self, detail_resp, 'permission_denied', 403)

    def test_student_cannot_perform_mutating_actions(self):
        self.authenticate_as(self.student)

        # create
        resp = self.client.post('/content/', format='json')
        assert_envelope(self, resp, 'permission_denied', 403)

        # update
        resp = self.client.put('/content/item-1/', format='json')
        assert_envelope(self, resp, 'permission_denied', 403)

        # partial_update
        resp = self.client.patch('/content/item-1/', format='json')
        assert_envelope(self, resp, 'permission_denied', 403)

        # destroy
        resp = self.client.delete('/content/item-1/')
        assert_envelope(self, resp, 'permission_denied', 403)

        # custom mutating action: reorder
        resp = self.client.post('/content/item-1/reorder/', format='json')
        assert_envelope(self, resp, 'permission_denied', 403)

        # custom mutating action: publish
        resp = self.client.post('/content/item-1/publish/', format='json')
        assert_envelope(self, resp, 'permission_denied', 403)

    def test_publisher_can_perform_mutating_actions(self):
        self.authenticate_as(self.publisher)

        # create
        resp = self.client.post('/content/', format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json(), {'action': 'create'})

        # update
        resp = self.client.put('/content/item-1/', format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {'action': 'update', 'pk': 'item-1'})

        # partial_update
        resp = self.client.patch('/content/item-1/', format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {'action': 'partial_update', 'pk': 'item-1'})

        # destroy
        resp = self.client.delete('/content/item-1/')
        self.assertEqual(resp.status_code, 204)

        # custom mutating action: reorder
        resp = self.client.post('/content/item-1/reorder/', format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {'action': 'reorder', 'pk': 'item-1'})

        # custom mutating action: publish
        resp = self.client.post('/content/item-1/publish/', format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {'action': 'publish', 'pk': 'item-1'})

    def test_unverified_publisher_can_mutate_but_cannot_read(self):
        # Orthogonality: mutating actions require IsPublisher (passes),
        # read actions require IsVerifiedAccount (fails with 403).
        unverified_pub = User.objects.create_user(
            email='unverified_pub@example.com',
            password=None,
            is_email_verified=False,
            is_publisher=True,
        )
        self.authenticate_as(unverified_pub)

        # Mutating action permitted
        resp = self.client.post('/content/', format='json')
        self.assertEqual(resp.status_code, 201)

        # Read action rejected
        list_resp = self.client.get('/content/')
        assert_envelope(self, list_resp, 'permission_denied', 403)

    def test_anonymous_caller_is_401_on_all_viewset_actions(self):
        self.client.credentials()
        endpoints = [
            ('get', '/content/'),
            ('get', '/content/item-1/'),
            ('post', '/content/'),
            ('put', '/content/item-1/'),
            ('patch', '/content/item-1/'),
            ('delete', '/content/item-1/'),
            ('post', '/content/item-1/reorder/'),
            ('post', '/content/item-1/publish/'),
        ]
        for http_method, url in endpoints:
            with self.subTest(method=http_method, url=url):
                method_fn = getattr(self.client, http_method)
                resp = method_fn(url)
                assert_envelope(self, resp, 'unauthenticated', 401)

    def test_is_authenticated_is_the_floor_and_never_the_ceiling(self):
        viewset = ContentTestViewSet()
        actions = (
            ('list', IsVerifiedAccount),
            ('retrieve', IsVerifiedAccount),
            ('create', IsPublisher),
            ('update', IsPublisher),
            ('partial_update', IsPublisher),
            ('destroy', IsPublisher),
            ('reorder', IsPublisher),
            ('publish', IsPublisher),
        )
        for action_name, expected_domain_permission in actions:
            with self.subTest(action=action_name):
                viewset.action = action_name
                perms = viewset.get_permissions()
                perm_classes = [p.__class__ for p in perms]
                # IsAuthenticated is always present as the first guard
                self.assertEqual(perm_classes[0], IsAuthenticated)
                # Specific domain permission is present
                self.assertIn(expected_domain_permission, perm_classes)
                # Never relying on a single permission or default
                self.assertGreaterEqual(len(perm_classes), 2)


# ---------------------------------------------------------------------------
# Privilege Protection and Isolation Security Tests
# ---------------------------------------------------------------------------

@TEST_SETTINGS
class PrivilegeProtectionSecurityTests(TestCase):
    """Verify is_publisher is the sole privilege identity and cannot be leaked/mutated."""

    def setUp(self):
        self.client = APIClient()
        self.publisher = User.objects.create_user(
            email=PUBLISHER_EMAIL,
            password=None,
            is_email_verified=True,
            is_publisher=True,
        )
        self.student = User.objects.create_user(
            email=STUDENT_EMAIL,
            password=None,
            is_email_verified=True,
            is_publisher=False,
        )

    def authenticate_as(self, user):
        token = str(AccessToken.for_user(user))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_is_publisher_is_boolean_default_false_on_user_model(self):
        field = User._meta.get_field('is_publisher')
        self.assertIsInstance(field, models.BooleanField)
        self.assertFalse(field.default)

    def test_is_publisher_is_the_single_privilege_identity(self):
        # AD-9, AR-12: Single custom user model carries is_publisher; no roles table or group permissions
        custom_privilege_fields = [
            f.name
            for f in User._meta.get_fields()
            if 'role' in f.name.lower() or 'permission' in f.name.lower()
        ]
        self.assertEqual(custom_privilege_fields, ['user_permissions'])

    def test_is_publisher_absent_from_all_account_serializers(self):
        # AR-12, AC 5: is_publisher is in no writable serializer or account state read serializer
        serializers_to_check = (
            RegistrationSerializer,
            AccountStateSerializer,
            PasswordResetRequestSerializer,
            PasswordResetConfirmSerializer,
        )
        for ser_class in serializers_to_check:
            with self.subTest(serializer=ser_class.__name__):
                ser = ser_class()
                self.assertNotIn('is_publisher', ser.fields)

    def test_registration_serializer_ignores_is_publisher_in_payload(self):
        serializer = RegistrationSerializer(
            data={
                'email': 'attacker@example.com',
                'password': REGISTRATION_PASSWORD,
                'is_publisher': True,
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn('is_publisher', serializer.validated_data)

    def test_me_endpoint_omits_is_publisher_for_student_and_publisher(self):
        # GET /api/v1/me/ must never expose is_publisher
        for user, role in ((self.student, 'student'), (self.publisher, 'publisher')):
            with self.subTest(role=role):
                self.authenticate_as(user)
                response = self.client.get(reverse('me'))
                self.assertEqual(response.status_code, 200)
                body = response.json()
                self.assertNotIn('is_publisher', body)
                self.assertEqual(sorted(body), ['email', 'is_email_verified'])

    def test_registration_endpoint_cannot_set_is_publisher(self):
        response = self.client.post(
            reverse('register'),
            {
                'email': 'hacker@example.com',
                'password': REGISTRATION_PASSWORD,
                'is_publisher': True,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        created_user = User.objects.get(email='hacker@example.com')
        self.assertFalse(created_user.is_publisher)

    def test_staff_and_superuser_without_is_publisher_cannot_mutate(self):
        # AD-9, AR-12: is_publisher is the sole privilege identity. Staff and superuser
        # flags without is_publisher=True do not grant write access and return 403.
        staff_user = User.objects.create_user(
            email='staff@example.com',
            password=None,
            is_staff=True,
            is_email_verified=True,
            is_publisher=False,
        )
        superuser = User.objects.create_superuser(
            email='superuser@example.com',
            password=None,
            is_staff=True,
            is_superuser=True,
            is_email_verified=True,
            is_publisher=False,
        )
        for user, role in ((staff_user, 'staff'), (superuser, 'superuser')):
            with self.subTest(role=role):
                self.authenticate_as(user)
                response = self.client.post('/test-action/', format='json')
                assert_envelope(self, response, 'permission_denied', 403)
