"""Assertions and source helpers shared by the content tests."""

import ast
from pathlib import Path

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


def class_sources(module, class_names):
    """The source text of the named classes in a module file.

    A source guard reads the view module as text and asserts what a class must
    or must not name. The parse-and-slice lives here once, so each guard names
    the classes it covers rather than repeating the AST walk.
    """
    source = Path(module.__file__).read_text(encoding='utf-8')
    tree = ast.parse(source)
    classes = {
        node.name: node
        for node in tree.body
        if isinstance(node, ast.ClassDef)
    }
    return {
        name: ast.get_source_segment(source, classes[name])
        for name in class_names
    }
