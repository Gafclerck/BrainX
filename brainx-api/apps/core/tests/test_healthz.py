"""Tests for the liveness route, the removed admin, and the project 404 body.

`healthz` is the single documented unauthenticated route. The Django admin is
not installed and not mounted, so `/admin/` is an unmatched route; with
`DEBUG = False` both it and any other unmatched route are rendered by the
project's `handler404` as the same five-key envelope every handled 404 uses.
"""

import ast

from django.conf import settings
from django.test import SimpleTestCase, override_settings
from django.urls import Resolver404, resolve, reverse

from rest_framework.exceptions import NotFound

from apps.core.exceptions import TITLES, brainx_exception_handler

ENVELOPE_KEYS = ('type', 'title', 'status', 'detail', 'errors')


def assert_envelope(test_case, response, expected_type, expected_status):
    """Assert the response is the five-key envelope for the given contract case."""
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
    """The admin app is gone: not installed, not mounted, nothing registered."""

    def test_admin_app_is_not_installed(self):
        self.assertNotIn('django.contrib.admin', settings.INSTALLED_APPS)

    def test_no_admin_route_is_mounted(self):
        with self.assertRaises(Resolver404):
            resolve('/admin/')

    def test_no_model_is_registered_in_the_admin_site(self):
        # AC4: no `admin.site.register(...)` call exists anywhere. Parsed as
        # AST rather than grepped, so this file's own source strings, comments
        # and imports cannot produce a false hit.
        root = settings.BASE_DIR
        sources = sorted(root.glob('apps/**/*.py')) + sorted(
            root.glob('config/**/*.py')
        )
        self.assertTrue(sources, 'no source files found to scan')
        for path in sources:
            tree = ast.parse(
                path.read_text(encoding='utf-8'), filename=str(path)
            )
            for node in ast.walk(tree):
                if (
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and node.func.attr == 'register'
                    and isinstance(node.func.value, ast.Attribute)
                    and node.func.value.attr == 'site'
                ):
                    self.fail(f'admin.site.register call found in {path}')


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
