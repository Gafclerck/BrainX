"""The search_document rebuild inside the single write port (Story 5.5).

Every content mutation composes the denormalised document inside `mutate`'s
existing transaction: a Lesson write carries its own bytes, a Module or Chapter
rename refreshes every live descendant with `search_document` alone, and a
Course rename touches nothing. The composition is pinned byte for byte against
migration 0005's frozen copy, and a rebuild that raises rolls the whole
mutation back - row, stamp and document all as they were before the write.
"""

import importlib
from datetime import date
from unittest import mock

from django.urls import reverse

from apps.content.models import Lesson
from apps.users.models import User

from .test_browse import BrowseTestCase
from .test_bulk_publish_commit import BulkPublishCommitTestCase
from .test_create_endpoints import PASSWORD, client_for

MIGRATION = importlib.import_module(
    'apps.content.migrations.0005_lesson_search_document'
)


class DocumentRebuildTestCase(BrowseTestCase):
    """The browse fixture plus API-level helpers to create indexed Lessons."""

    def create_lesson(self, chapter, **payload):
        """Create a Lesson through the API and return (response, stored row).

        The write goes through the single entry point, so the stored row
        carries the document composed at insert - the state every test here
        starts from or drives.
        """
        body = {
            'title': 'Quadratics',
            'description': 'Parabolas and roots',
            'teacher': 'Ms Ada',
            'course_date': '2026-09-01',
            **payload,
        }
        response = self.publisher_client.post(
            reverse('lesson-create', args=[chapter.pk]), body, format='json'
        )
        self.assertEqual(response.status_code, 201)
        return response, Lesson.objects.get(pk=response.json()['id'])

    def stored(self, lesson):
        """The row as the database holds it after any mutation."""
        return Lesson.objects.get(pk=lesson.pk)


class ComposeByteContractTests(DocumentRebuildTestCase):
    """The live compose reproduces migration 0005's frozen bytes."""

    def assert_matches_the_frozen_composition(self, lesson):
        lesson.refresh_from_db()
        self.assertEqual(
            lesson.compose_search_document(),
            MIGRATION.compose_search_document(
                lesson.title,
                lesson.description,
                lesson.keywords,
                lesson.chapter.module.name,
                lesson.chapter.name,
            ),
        )

    def test_a_rich_lesson_reproduces_the_frozen_bytes(self):
        _, lesson = self.create_lesson(
            self.chapter,
            title='Algorithms',
            description='Greedy and lazy',
            keywords='sorting, graphs',
        )

        self.assertEqual(
            lesson.search_document,
            'Algorithms\nGreedy and lazy\nsorting, graphs'
            '\nModule 1\nChapter 1',
        )
        self.assert_matches_the_frozen_composition(lesson)

    def test_a_lesson_without_keywords_keeps_the_blank_line(self):
        response, lesson = self.create_lesson(
            self.chapter, title='Bare', description=''
        )

        # 5.4's golden example, unchanged by the rebuild landing.
        self.assertEqual(
            lesson.search_document, 'Bare\n\n\nModule 1\nChapter 1'
        )
        self.assert_matches_the_frozen_composition(lesson)
        # AC 1: keywords is writable and exposed; search_document never is.
        body = response.json()
        self.assertEqual(body['keywords'], '')
        self.assertNotIn('search_document', body)


class LessonWriteRebuildTests(DocumentRebuildTestCase):
    """AC 1-3, 5: a Lesson write carries the current inputs into the bytes."""

    def test_a_created_lesson_is_composed_at_insert(self):
        _, lesson = self.create_lesson(
            self.chapter,
            title='Quadratics',
            description='Parabolas and roots',
            keywords='exam revision',
        )

        self.assertEqual(
            lesson.search_document,
            'Quadratics\nParabolas and roots\nexam revision'
            '\nModule 1\nChapter 1',
        )

    def test_editing_keywords_rebuilds_the_document_in_place(self):
        _, lesson = self.create_lesson(self.chapter, keywords='')
        before = lesson.search_document
        self.assertNotIn('revision', before)

        response = self.publisher_client.patch(
            reverse('lesson-update', args=[lesson.pk]),
            {'keywords': 'exam revision'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['keywords'], 'exam revision')
        lesson = self.stored(lesson)
        self.assertIn('revision', lesson.search_document)
        self.assertEqual(
            lesson.search_document, lesson.compose_search_document()
        )

    def test_moving_a_lesson_points_the_document_at_the_new_parents(self):
        module2 = self.make_module(self.course, name='Module 2', position=2)
        target = self.make_chapter(module2, name='Chapter 9')
        _, lesson = self.create_lesson(self.chapter)

        response = self.publisher_client.patch(
            reverse('lesson-move', args=[lesson.pk]),
            {'chapter': str(target.pk)},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        document = self.stored(lesson).search_document
        self.assertIn('Module 2', document)
        self.assertIn('Chapter 9', document)
        self.assertNotIn('Module 1', document)
        self.assertNotIn('Chapter 1', document)

    def test_a_course_rename_leaves_the_documents_untouched(self):
        _, lesson = self.create_lesson(self.chapter)
        before = self.stored(lesson).search_document

        response = self.publisher_client.patch(
            reverse('course-update', args=[self.course.pk]),
            {'name': 'Pure mathematics', 'subject': 'Calculus'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.stored(lesson).search_document, before)

    def test_publishing_a_preexisting_unindexed_lesson_indexes_it(self):
        # A row the write port never touched: built with the ORM as a draft,
        # so its document is empty - the state Story 5.5 must fix the moment
        # the Lesson is published through the single publish action.
        lesson = Lesson.objects.create(
            chapter=self.chapter,
            title='Draft quadratics',
            description='Parabolas and roots',
            teacher='Ms Ada',
            course_date=date(2026, 9, 1),
            position=2,
            last_modified_by=self.publisher,
        )
        self.assertEqual(lesson.search_document, '')

        response = self.publisher_client.post(
            reverse('lesson-publish', args=[lesson.pk])
        )

        self.assertEqual(response.status_code, 200)
        stored = self.stored(lesson)
        self.assertNotEqual(stored.search_document, '')
        self.assertEqual(
            stored.search_document, stored.compose_search_document()
        )


class ContainerRenameRebuildTests(DocumentRebuildTestCase):
    """AC 4: a rename reaches every live descendant, and only its own bytes."""

    def second_publisher_client(self):
        other = User.objects.create_user(
            email='second@example.com',
            password=PASSWORD,
            is_publisher=True,
            is_email_verified=True,
        )
        return client_for(other)

    def test_a_module_rename_refreshes_every_descendant_document(self):
        chapter2 = self.make_chapter(self.module, name='Chapter 2', position=2)
        _, first = self.create_lesson(self.chapter)
        _, second = self.create_lesson(chapter2, title='Also quadratics')
        # A different Publisher touched the descendants, so their stamps are
        # distinguishable from the renaming actor's.
        other = self.second_publisher_client()
        for lesson in (first, second):
            response = other.patch(
                reverse('lesson-update', args=[lesson.pk]),
                {'teacher': 'Mr Euler'},
                format='json',
            )
            self.assertEqual(response.status_code, 200)
        stamped = {}
        for lesson in (first, second):
            lesson.refresh_from_db()
            stamped[lesson.pk] = (lesson.updated_at, lesson.last_modified_by)

        response = self.publisher_client.patch(
            reverse('module-update', args=[self.module.pk]),
            {'name': 'Geometry'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        for lesson in (first, second):
            with self.subTest(lesson=lesson.pk):
                stored = self.stored(lesson)
                self.assertIn('Geometry', stored.search_document)
                self.assertNotIn('Module 1', stored.search_document)
                self.assertEqual(
                    stored.search_document, stored.compose_search_document()
                )
                # The refresh wrote search_document alone: the descendant was
                # neither re-stamped nor re-timestamped by the rename.
                updated_at, actor = stamped[lesson.pk]
                self.assertEqual(stored.updated_at, updated_at)
                self.assertEqual(stored.last_modified_by, actor)

    def test_a_chapter_rename_refreshes_only_its_own_lessons(self):
        chapter2 = self.make_chapter(self.module, name='Chapter 2', position=2)
        _, mine = self.create_lesson(self.chapter)
        _, theirs = self.create_lesson(chapter2, title='Other quadratics')
        untouched = self.stored(theirs).search_document

        response = self.publisher_client.patch(
            reverse('chapter-update', args=[self.chapter.pk]),
            {'name': 'Constructions'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        renamed = self.stored(mine)
        self.assertIn('Constructions', renamed.search_document)
        self.assertNotIn('Chapter 1', renamed.search_document)
        self.assertEqual(self.stored(theirs).search_document, untouched)

    def test_a_removed_lesson_is_not_a_rename_candidate(self):
        _, lesson = self.create_lesson(self.chapter)
        removed = self.publisher_client.delete(
            reverse('lesson-update', args=[lesson.pk])
        )
        self.assertEqual(removed.status_code, 200)
        untouched = self.stored(lesson).search_document

        response = self.publisher_client.patch(
            reverse('module-update', args=[self.module.pk]),
            {'name': 'Geometry'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        # The refresh covers live descendants; a removed row is left alone
        # and its document is rebuilt by its own next write instead.
        self.assertEqual(self.stored(lesson).search_document, untouched)

    def test_a_removed_lesson_is_rebuilt_by_its_own_next_write(self):
        _, lesson = self.create_lesson(self.chapter)
        removed = self.publisher_client.delete(
            reverse('lesson-update', args=[lesson.pk])
        )
        self.assertEqual(removed.status_code, 200)

        renamed = self.publisher_client.patch(
            reverse('module-update', args=[self.module.pk]),
            {'name': 'Geometry'},
            format='json',
        )
        self.assertEqual(renamed.status_code, 200)
        # The removed row is not a rename candidate: its bytes stand.
        self.assertNotIn('Geometry', self.stored(lesson).search_document)

        restored = self.publisher_client.post(
            reverse('lesson-restore', args=[lesson.pk])
        )

        # The promise the removal test makes, kept: the restored Lesson's
        # own next write rebuilds it against the Module's new name.
        self.assertEqual(restored.status_code, 200)
        stored = self.stored(lesson)
        self.assertIn('Geometry', stored.search_document)
        self.assertNotIn('Module 1', stored.search_document)
        self.assertEqual(
            stored.search_document, stored.compose_search_document()
        )


class RollbackOnRebuildFailureTests(DocumentRebuildTestCase):
    """AC 7: a rebuild failure rolls back row, stamp and document together."""

    def test_a_failed_lesson_compose_writes_nothing(self):
        _, lesson = self.create_lesson(self.chapter, keywords='')
        before = self.stored(lesson)

        with mock.patch.object(
            Lesson, 'compose_search_document', side_effect=RuntimeError('boom')
        ):
            with self.assertRaises(RuntimeError):
                self.publisher_client.patch(
                    reverse('lesson-update', args=[lesson.pk]),
                    {'keywords': 'bad keywords', 'teacher': 'Mr Euler'},
                    format='json',
                )

        after = self.stored(lesson)
        self.assertEqual(after.keywords, '')
        self.assertEqual(after.teacher, 'Ms Ada')
        self.assertEqual(after.search_document, before.search_document)
        self.assertEqual(after.updated_at, before.updated_at)
        self.assertEqual(after.last_modified_by, before.last_modified_by)

    def test_a_failed_descendant_refresh_rolls_back_the_rename(self):
        _, lesson = self.create_lesson(self.chapter)
        lesson_before = self.stored(lesson)
        name_before = self.module.name
        updated_before = self.module.updated_at
        actor_before = self.module.last_modified_by

        with mock.patch.object(
            Lesson, 'compose_search_document', side_effect=RuntimeError('boom')
        ):
            with self.assertRaises(RuntimeError):
                self.publisher_client.patch(
                    reverse('module-update', args=[self.module.pk]),
                    {'name': 'Geometry'},
                    format='json',
                )

        self.module.refresh_from_db()
        after = self.stored(lesson)
        # The container row change, its stamp and the descendant document all
        # pre-date the mutation: never a renamed-but-unindexed subtree.
        self.assertEqual(self.module.name, name_before)
        self.assertEqual(self.module.updated_at, updated_before)
        self.assertEqual(self.module.last_modified_by, actor_before)
        self.assertEqual(after.search_document, lesson_before.search_document)
        self.assertEqual(after.updated_at, lesson_before.updated_at)


class BulkPublishRebuildTests(BulkPublishCommitTestCase):
    """AC 6: each flipped row rebuilds inside the commit's transaction."""

    def test_a_commit_composes_every_flipped_row(self):
        ready = self.make_lesson(self.chapter, 1)
        already = self.make_lesson(self.chapter, 2, is_published=True)
        stamped = (already.updated_at, already.last_modified_by_id)
        self.assertEqual(ready.search_document, '')
        body = self.preview(self.chapter_preview_url())

        response = self.commit(self.chapter_commit_url(), body)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['changed'], 1)
        ready.refresh_from_db()
        self.assertEqual(
            ready.search_document, ready.compose_search_document()
        )
        # Only the flipped row is written; the already-published row keeps its
        # bytes and is not re-stamped by the commit.
        already.refresh_from_db()
        self.assertEqual(already.search_document, '')
        self.assertEqual(
            (already.updated_at, already.last_modified_by_id), stamped
        )

    def test_a_rebuild_failure_rolls_back_the_whole_commit(self):
        self.make_lesson(self.chapter, 1)
        self.make_lesson(self.chapter, 2)
        body = self.preview(self.chapter_preview_url())

        with mock.patch.object(
            Lesson, 'compose_search_document', side_effect=RuntimeError('boom')
        ):
            with self.assertRaises(RuntimeError):
                self.commit(self.chapter_commit_url(), body)

        # No saved-but-unindexed row: the flips and their rebuilds share the
        # commit's transaction, so nothing is half-published.
        self.assertFalse(Lesson.objects.filter(is_published=True).exists())
        self.assertFalse(
            Lesson.objects.filter(search_document__gt='').exists()
        )
