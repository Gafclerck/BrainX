"""Assertions shared by the content tests."""

ENVELOPE_KEYS = ('type', 'title', 'status', 'detail', 'errors')


def assert_envelope(test_case, response, expected_type, expected_status):
    """The five-key contract on every rejection, and the status it arrived on."""
    body = response.json()
    test_case.assertEqual(sorted(body), sorted(ENVELOPE_KEYS))
    test_case.assertEqual(body['type'], expected_type)
    test_case.assertTrue(body['title'])
    test_case.assertEqual(body['status'], expected_status)
    test_case.assertEqual(response.status_code, expected_status)
    test_case.assertTrue(body['detail'])
    test_case.assertIsInstance(body['errors'], dict)
    test_case.assertTrue(response['Content-Type'].startswith('application/json'))
    return body
