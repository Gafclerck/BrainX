"""Test helpers shared across all BrainX test suites (Epic 2, Story 2.1)."""

from apps.core.exceptions import TITLES

ENVELOPE_KEYS = ('type', 'title', 'status', 'detail', 'errors')
RESERVED_KEYS = ('blocked',)


def assert_envelope(test_case, response, expected_type, expected_status):
    """The five-key RFC 9457 / AR-25 contract on every rejection, and the status it arrived on."""
    body = response.json()
    test_case.assertEqual(sorted(body), sorted(ENVELOPE_KEYS))
    test_case.assertEqual(body['type'], expected_type)
    if expected_type in TITLES:
        test_case.assertEqual(body['title'], TITLES[expected_type])
    else:
        test_case.assertTrue(body['title'])
    test_case.assertEqual(body['status'], expected_status)
    test_case.assertEqual(response.status_code, expected_status)
    test_case.assertTrue(body['detail'])
    test_case.assertIsInstance(body['errors'], dict)
    test_case.assertTrue(response['Content-Type'].startswith('application/json'))
    for reserved in RESERVED_KEYS:
        test_case.assertNotIn(reserved, body)
    return body
