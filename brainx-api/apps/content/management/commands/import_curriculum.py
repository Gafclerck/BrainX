"""Management command to import real courses from a hierarchical Markdown directory.

Directory structure:
  <curriculum_root>/
    <Course_Name>/
      <Module_Name>/
        <Chapter_Name>/
          <01-Lesson_Title>.md
          attachments/
            support.pdf
            schema.png

Each lesson file contains YAML frontmatter:
---
title: "Titre de la leçon"
teacher: "Nom de l'enseignant"
course_date: "2026-11-20"
description: "Description ou résumé"
keywords: "mot1, mot2, mot3"
is_published: true
resources:
  - type: document
    title: "Support PDF"
    file: "attachments/support.pdf"
  - type: video
    title: "Vidéo du cours"
    url: "https://..."
---
# Corps de la leçon en Markdown
...
"""

import os
import re
from datetime import date, datetime
from pathlib import Path
import yaml

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.content.models import Chapter, Course, Lesson, Module, Resource
from apps.users.models import User


def parse_clean_name(name):
    """Strip leading numbers like '01-' and replace underscores/hyphens with spaces."""
    cleaned = re.sub(r'^\d+[\-_.]\s*', '', name)
    return cleaned.replace('_', ' ').replace('-', ' ').strip()


def extract_frontmatter_and_body(content):
    """Extract YAML frontmatter and markdown body from file content."""
    pattern = r'^---\s*\n(.*?)\n---\s*\n(.*)$'
    match = re.match(pattern, content, re.DOTALL)
    if match:
        raw_yaml, body = match.groups()
        try:
            metadata = yaml.safe_load(raw_yaml) or {}
        except Exception:
            metadata = {}
        return metadata, body.strip()
    return {}, content.strip()


class Command(BaseCommand):
    help = 'Import or synchronize course curriculum from Markdown directory tree.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--path',
            type=str,
            default='curriculum',
            help='Directory path containing the curriculum folders.',
        )
        parser.add_argument(
            '--publisher-email',
            type=str,
            default=None,
            help='Email of the publisher account to assign as author.',
        )

    def handle(self, *args, **options):
        curriculum_path = Path(options['path'])
        if not curriculum_path.is_absolute():
            curriculum_path = Path(os.getcwd()) / curriculum_path

        if not curriculum_path.exists() or not curriculum_path.is_dir():
            raise CommandError(f"Directory not found: {curriculum_path}")

        # Resolve publisher
        publisher_email = options['publisher_email']
        publisher = None
        if publisher_email:
            publisher = User.objects.filter(email=publisher_email).first()

        if not publisher:
            publisher = User.objects.filter(is_publisher=True).first()

        if not publisher:
            publisher, _ = User.objects.get_or_create(
                email='publisher@brainx.local',
                defaults={
                    'is_publisher': True,
                    'is_email_verified': True,
                },
            )
            publisher.set_password('BrainXPublisher2026!')
            publisher.save()

        self.stdout.write(self.style.SUCCESS(f"Author account: {publisher.email}"))
        self.stdout.write(f"Scanning curriculum from: {curriculum_path}")

        counts = {
            'courses': 0,
            'modules': 0,
            'chapters': 0,
            'lessons': 0,
            'resources': 0,
        }

        # Scan Level 1: Course folders
        course_dirs = sorted([d for d in curriculum_path.iterdir() if d.is_dir()])
        for course_idx, c_dir in enumerate(course_dirs, start=1):
            course_name = parse_clean_name(c_dir.name)
            with transaction.atomic():
                course, c_created = Course.objects.get_or_create(
                    name=course_name,
                    defaults={
                        'subject': course_name,
                        'position': course_idx,
                        'last_modified_by': publisher,
                    },
                )
                if c_created:
                    counts['courses'] += 1
                    self.stdout.write(self.style.SUCCESS(f" [Course +] {course.name}"))

                # Scan Level 2: Module folders
                module_dirs = sorted([d for d in c_dir.iterdir() if d.is_dir()])
                for module_idx, m_dir in enumerate(module_dirs, start=1):
                    module_name = parse_clean_name(m_dir.name)
                    module, m_created = Module.objects.get_or_create(
                        course=course,
                        name=module_name,
                        defaults={
                            'position': module_idx,
                            'last_modified_by': publisher,
                        },
                    )
                    if m_created:
                        counts['modules'] += 1
                        self.stdout.write(f"   [Module +] {module.name}")

                    # Scan Level 3: Chapter folders
                    chapter_dirs = sorted([d for d in m_dir.iterdir() if d.is_dir()])
                    for chapter_idx, ch_dir in enumerate(chapter_dirs, start=1):
                        chapter_name = parse_clean_name(ch_dir.name)
                        chapter, ch_created = Chapter.objects.get_or_create(
                            module=module,
                            name=chapter_name,
                            defaults={
                                'position': chapter_idx,
                                'last_modified_by': publisher,
                            },
                        )
                        if ch_created:
                            counts['chapters'] += 1
                            self.stdout.write(f"     [Chapter +] {chapter.name}")

                        # Scan Level 4: Lesson markdown files
                        lesson_files = sorted([f for f in ch_dir.glob('*.md')])
                        for lesson_idx, l_file in enumerate(lesson_files, start=1):
                            raw_text = l_file.read_text(encoding='utf-8')
                            metadata, body = extract_frontmatter_and_body(raw_text)

                            title = metadata.get('title') or parse_clean_name(l_file.stem)
                            teacher = metadata.get('teacher') or 'Équipe Pédagogique'
                            raw_date = metadata.get('course_date')
                            if isinstance(raw_date, (datetime, date)):
                                course_date = raw_date
                            elif isinstance(raw_date, str):
                                try:
                                    course_date = datetime.strptime(raw_date, '%Y-%m-%d').date()
                                except ValueError:
                                    course_date = date.today()
                            else:
                                course_date = date.today()

                            description = metadata.get('description') or body or f"Leçon sur {title}"
                            keywords = metadata.get('keywords') or course_name
                            is_published = bool(metadata.get('is_published', True))

                            lesson, l_created = Lesson.objects.update_or_create(
                                chapter=chapter,
                                title=title,
                                defaults={
                                    'teacher': teacher,
                                    'course_date': course_date,
                                    'description': description,
                                    'keywords': keywords,
                                    'position': lesson_idx,
                                    'is_published': is_published,
                                    'last_modified_by': publisher,
                                },
                            )
                            # Recompute search trigram document
                            lesson.search_document = lesson.compose_search_document()
                            lesson.save(update_fields=['search_document'])

                            if l_created:
                                counts['lessons'] += 1
                                self.stdout.write(f"       [Lesson +] {lesson.title}")

                            # Process attached resources
                            resources_list = metadata.get('resources', [])
                            for res_item in resources_list:
                                res_type = str(res_item.get('type', '')).lower()
                                res_title = res_item.get('title') or f"Ressource {res_type}"
                                res_note = res_item.get('note', '')

                                if res_type in (Resource.Type.VIDEO, Resource.Type.EXTERNAL_LINK):
                                    res_url = res_item.get('url', '')
                                    if res_url:
                                        _, r_created = Resource.objects.get_or_create(
                                            lesson=lesson,
                                            title=res_title,
                                            type=res_type,
                                            defaults={
                                                'url': res_url,
                                                'note': res_note,
                                                'last_modified_by': publisher,
                                            },
                                        )
                                        if r_created:
                                            counts['resources'] += 1
                                elif res_type in (Resource.Type.DOCUMENT, Resource.Type.IMAGE):
                                    rel_file_path = res_item.get('file', '')
                                    if rel_file_path:
                                        file_abs_path = l_file.parent / rel_file_path
                                        if file_abs_path.exists() and file_abs_path.is_file():
                                            with open(file_abs_path, 'rb') as f:
                                                resource, r_created = Resource.objects.get_or_create(
                                                    lesson=lesson,
                                                    title=res_title,
                                                    type=res_type,
                                                    defaults={
                                                        'file': File(f, name=file_abs_path.name),
                                                        'note': res_note,
                                                        'last_modified_by': publisher,
                                                    },
                                                )
                                                if r_created:
                                                    counts['resources'] += 1

        self.stdout.write(self.style.SUCCESS(
            f"\nCurriculum import completed successfully:\n"
            f" - Courses: {counts['courses']}\n"
            f" - Modules: {counts['modules']}\n"
            f" - Chapters: {counts['chapters']}\n"
            f" - Lessons: {counts['lessons']}\n"
            f" - Resources: {counts['resources']}"
        ))
