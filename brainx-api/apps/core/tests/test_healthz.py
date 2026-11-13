"""Tests for the liveness route, the removed admin, and the project 404 body.

`healthz` is the single documented unauthenticated route. The Django admin is
not installed and not mounted, so `/admin/` is an unmatched route; with
`DEBUG = False` both it and any other unmatched route are rendered by the
project's `handler404` as the same five-key envelope every handled 404 uses.
"""

from django.conf import settings
from django.test import SimpleTestCase, override_settings
from django.urls import Resolver404, resolve, reverse

from rest_framework.exceptions import NotFound

from apps.core.exceptions import TITLES, brainx_exception_handler
from apps.core.tests.helpers import ENVELOPE_KEYS, assert_envelope


class HealthzTests(SimpleTestCase):
    """The liveness probe: reachable with no credentials, one key in the body."""

    def test_healthz_is_reachable_without_credentials(self):
        response = self.client.get('/api/v1/healthz/')
        self.assertEqual(response.status_code, 200)

    def test_healthz_returns_only_a_status(self):
        response = self.client.get(reverse('core:healthz'))
        self.assertEqual(response.json(), {'status': 'ok'})
        self.assertTrue(response['Content-Type'].startswith('application/json'))

    def test_healthz_is_namespaced_under_the_api_prefix(self):
        # The include is namespaced (`core:healthz`) so the route this app adds
        # at the users app's prefix cannot collide with a bare-name reverse.
        self.assertEqual(
            reverse('core:healthz'), f'{settings.API_PREFIX}/healthz/'
        )


class DjangoAdminRemovalTests(SimpleTestCase):
    """The admin app is gone: not installed, not mounted."""

    def test_admin_app_is_not_installed(self):
        self.assertNotIn('django.contrib.admin', settings.INSTALLED_APPS)

    def test_no_admin_route_is_mounted(self):
        with self.assertRaises(Resolver404):
            resolve('/admin/')


@override_settings(DEBUG=False)
class Project404EnvelopeTests(SimpleTestCase):
    """An unmatched route and the removed admin route are the 404 envelope."""

    def test_unmatched_route_renders_the_404_envelope(self):
        response = self.client.get('/no-such-route/')
        assert_envelope(self, response, 'not_found', 404)

    def test_admin_route_renders_the_404_envelope(self):
        response = self.client.get('/admin/')
        assert_envelope(self, response, 'not_found', 404)

    def test_admin_and_unmatched_routes_share_one_body(self):
        self.assertEqual(
            self.client.get('/admin/').json(),
            self.client.get('/no-such-route/').json(),
        )

    def test_handler404_matches_the_handled_not_found_envelope(self):
        # The handled path (`brainx_exception_handler`) and the handler404 path
        # build from the same builder, so a byte-identical body is the property
        # that keeps the two 404 surfaces from drifting apart.
        handled = brainx_exception_handler(
            NotFound(), {'view': None, 'request': None}
        )
        response = self.client.get('/no-such-route/')
        self.assertEqual(response.json(), handled.data)
        self.assertEqual(response.status_code, handled.status_code)
