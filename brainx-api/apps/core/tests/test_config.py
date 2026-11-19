"""Tests for the public system configuration endpoint (Story 1.1).

The system config endpoint `/api/v1/config/` is publicly accessible without
authentication, allowing frontends to discover operational feature switches
such as `BRAINX_PUBLIC_BROWSING`.
"""

from django.conf import settings
from django.test import SimpleTestCase, override_settings
from django.urls import reverse


class SystemConfigEndpointTests(SimpleTestCase):
    """The system config endpoint: reachable without credentials under both flag states."""

    def test_config_endpoint_is_namespaced_under_api_prefix(self):
        self.assertEqual(
            reverse('core:config'), f'{settings.API_PREFIX}/config/'
        )

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_config_reports_public_browsing_true_when_enabled(self):
        response = self.client.get(reverse('core:config'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'public_browsing': True})
        self.assertTrue(response['Content-Type'].startswith('application/json'))

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_config_reports_public_browsing_false_when_disabled(self):
        response = self.client.get(reverse('core:config'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'public_browsing': False})
        self.assertTrue(response['Content-Type'].startswith('application/json'))

    @override_settings(BRAINX_PUBLIC_BROWSING=True)
    def test_config_accessible_with_invalid_authorization_header(self):
        response = self.client.get(
            reverse('core:config'),
            HTTP_AUTHORIZATION='Bearer invalid-token-string',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'public_browsing': True})

    @override_settings(BRAINX_PUBLIC_BROWSING=False)
    def test_config_accessible_with_invalid_authorization_header_when_disabled(self):
        response = self.client.get(
            reverse('core:config'),
            HTTP_AUTHORIZATION='Bearer invalid-token-string',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'public_browsing': False})

    def test_config_rejects_non_get_requests(self):
        url = reverse('core:config')
        for method in ('post', 'put', 'patch', 'delete'):
            with self.subTest(method=method):
                client_method = getattr(self.client, method)
                response = client_method(url)
                self.assertEqual(response.status_code, 405)
