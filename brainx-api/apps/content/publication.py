"""The single definition of what makes a Lesson publishable (Epic 4, Story 4.1).

Publishing a Lesson and editing one that is already published ask the same
question - is the required metadata present? - so the rule lives here once and
both callers read it. Keeping it in one place is what stops "passed validation"
and "the Publisher asked" from drifting into two definitions of Published.

The required set is the four metadata fields a Student-facing Lesson must
carry: `title`, `description`, `teacher` and `course_date`. `description` is
optional at creation but mandatory to publish, which is the only reason it is
listed here beside fields the model already requires.

A field is missing when it is blank: the three text fields after `str.strip()`,
and `course_date` when it is `None`. The returned map is keyed by the model
field names, so its shape matches the `errors` map the create and update
serializers produce and a client parses both the same way.
"""

# The metadata fields a Lesson must carry to be published, in the order the
# errors map reports them.
LESSON_REQUIRED_METADATA = ('title', 'description', 'teacher', 'course_date')

# The subset checked for blank text rather than absence; `course_date` is a
# real date and is missing only when it is `None`.
_TEXT_METADATA = ('title', 'description', 'teacher')

_MISSING_MESSAGE = 'This field is required to publish the Lesson.'


def lesson_missing_metadata(lesson, changes=None):
    """Every required `lesson` field that is missing, keyed by field name.

    `changes` overlays the fields a write would set, so an update is judged on
    the state it would leave behind rather than the row's current state: the
    value for each required field is the change's when it names one, otherwise
    the row's own. Returns `{field: [message]}` for every missing field, so a
    caller names all of them at once rather than only the first.
    """
    changes = changes or {}
    missing = {}
    for field in LESSON_REQUIRED_METADATA:
        if field in changes:
            value = changes[field]
        else:
            value = getattr(lesson, field)
        if _is_missing(field, value):
            missing[field] = [_MISSING_MESSAGE]
    return missing


def _is_missing(field, value):
    """Whether `value` leaves `field` blank under the publishable rule."""
    if field in _TEXT_METADATA:
        return not str(value or '').strip()
    return value is None
