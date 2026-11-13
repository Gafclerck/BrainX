"""Tests for import_curriculum management command (Story 3.2)."""

import tempfile
from pathlib import Path
from django.core.management import call_command
from django.test import TestCase

from apps.content.models import Chapter, Course, Lesson, Module, Resource
from apps.users.models import User


class ImportCurriculumTestCase(TestCase):
    def setUp(self):
        self.publisher = User.objects.create_user(
            email='teacher@brainx.local',
            password='Password123!',
            is_publisher=True,
            is_email_verified=True,
        )

    def test_import_curriculum_success_and_idempotence(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)

            # Build 4-level structure: Course -> Module -> Chapter -> Lesson.md
            course_dir = root / "01-Informatique-Theorique"
            module_dir = course_dir / "01-Algorithmes"
            chapter_dir = module_dir / "01-Complexite"
            chapter_dir.mkdir(parents=True)

            # Create an attachment
            attach_dir = chapter_dir / "attachments"
            attach_dir.mkdir()
            pdf_file = attach_dir / "polycopie.pdf"
            pdf_file.write_bytes(b"%PDF-1.4 dummy pdf content")

            # Create lesson markdown file with frontmatter
            lesson_file = chapter_dir / "01-Notation-Grand-O.md"
            lesson_file.write_text(
                """---
title: "Notation Grand O et Asymptotique"
teacher: "Dr. Turing"
course_date: "2026-11-15"
description: "Introduction aux classes de complexité temporelle."
keywords: "complexité, grand o, asymptotique"
is_published: true
resources:
  - type: document
    title: "Polycopié complet"
    file: "attachments/polycopie.pdf"
  - type: external_link
    title: "Référence externe"
    url: "https://example.com/algo"
---
# Cours sur la complexité algorithmique
Le calcul de la complexité temporelle s'effectue au pire des cas...
""",
                encoding="utf-8",
            )

            # First run: should create entities
            call_command('import_curriculum', path=str(root), publisher_email=self.publisher.email)

            course = Course.objects.filter(name="Informatique Theorique").first()
            self.assertIsNotNone(course)

            module = Module.objects.filter(course=course, name="Algorithmes").first()
            self.assertIsNotNone(module)

            chapter = Chapter.objects.filter(module=module, name="Complexite").first()
            self.assertIsNotNone(chapter)

            lesson = Lesson.objects.filter(chapter=chapter, title="Notation Grand O et Asymptotique").first()
            self.assertIsNotNone(lesson)
            self.assertEqual(lesson.teacher, "Dr. Turing")
            self.assertEqual(str(lesson.course_date), "2026-11-15")
            self.assertTrue(lesson.is_published)
            self.assertIn("complexité", lesson.search_document.lower())

            # Verify resources
            self.assertEqual(lesson.resources.count(), 2)
            doc_res = lesson.resources.filter(type=Resource.Type.DOCUMENT).first()
            self.assertIsNotNone(doc_res)
            self.assertTrue("polycopie" in doc_res.file.name and doc_res.file.name.endswith(".pdf"))

            ext_res = lesson.resources.filter(type=Resource.Type.EXTERNAL_LINK).first()
            self.assertIsNotNone(ext_res)
            self.assertEqual(ext_res.url, "https://example.com/algo")

            # Second run: must be idempotent without creating duplicate entities
            call_command('import_curriculum', path=str(root), publisher_email=self.publisher.email)

            self.assertEqual(Course.objects.filter(name="Informatique Theorique").count(), 1)
            self.assertEqual(Module.objects.filter(course=course).count(), 1)
            self.assertEqual(Chapter.objects.filter(module=module).count(), 1)
            self.assertEqual(Lesson.objects.filter(chapter=chapter).count(), 1)
            self.assertEqual(lesson.resources.count(), 2)
