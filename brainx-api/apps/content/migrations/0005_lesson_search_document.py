# Story 5.4 - the first trigram indexing in the project: the pg_trgm
# extension, the two Lesson storage fields, the backfill that composes every
# existing document, and the functional GIN trigram index the epic owns.

from django.contrib.postgres.indexes import GinIndex, OpClass
from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations, models
from django.db.models.functions import Upper


def compose_search_document(
    title, description, keywords, module_name, chapter_name
):
    """title + description + keywords + Module and Chapter names, as authored.

    The composition Story 5.4 pins: newline-joined and stored as authored,
    because the `icontains` match uppercases both sides at query time. This
    copy lives in the migration so a fresh database replays the same bytes
    even if the live code ever moves; Story 5.5's rebuild must reproduce it
    byte for byte.
    """
    return '\n'.join(
        [title, description, keywords, module_name, chapter_name]
    )


def backfill(apps, schema_editor):
    """Stamp every existing Lesson with its composed document."""
    Lesson = apps.get_model('content', 'Lesson')
    lessons = Lesson.objects.select_related(
        'chapter__module__course'
    ).iterator()
    for lesson in lessons:
        lesson.search_document = compose_search_document(
            lesson.title,
            lesson.description,
            lesson.keywords,
            lesson.chapter.module.name,
            lesson.chapter.name,
        )
        lesson.save(update_fields=['search_document'])


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0004_lesson_is_published'),
    ]

    operations = [
        TrigramExtension(),
        migrations.AddField(
            model_name='lesson',
            name='keywords',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='lesson',
            name='search_document',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AddIndex(
            model_name='lesson',
            index=GinIndex(
                OpClass(Upper('search_document'), name='gin_trgm_ops'),
                name='lesson_search_document_trgm',
            ),
        ),
    ]
