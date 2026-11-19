"""Assertions and source helpers shared by the content tests."""

import ast
from pathlib import Path

from apps.core.tests.helpers import ENVELOPE_KEYS, assert_envelope


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
