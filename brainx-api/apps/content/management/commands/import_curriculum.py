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
"""

import os
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.content.curriculum_sync import (
    extract_frontmatter_and_body,
    parse_clean_name,
    resolve_default_publisher,
    sync_curriculum,
)
from apps.users.models import User


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
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulate synchronization without committing changes to database.',
        )

    def handle(self, *args, **options):
        curriculum_path = Path(options['path'])
        if not curriculum_path.is_absolute():
            curriculum_path = Path(os.getcwd()) / curriculum_path

        if not curriculum_path.exists() or not curriculum_path.is_dir():
            raise CommandError(f"Directory not found: {curriculum_path}")

        publisher_email = options.get('publisher_email')
        publisher = None
        if publisher_email:
            publisher = User.objects.filter(email=publisher_email).first()
            if not publisher:
                raise CommandError(f"User with email '{publisher_email}' not found.")
        else:
            publisher = resolve_default_publisher()

        self.stdout.write(self.style.SUCCESS(f"Author account: {publisher.email}"))

        dry_run = options.get('dry_run', False)
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY-RUN MODE: No changes will be saved to the database."))

        result = sync_curriculum(
            curriculum_path=curriculum_path,
            publisher=publisher,
            dry_run=dry_run,
            logger=self.stdout.write,
        )

        counts = result['counts']
        self.stdout.write(self.style.SUCCESS(
            f"\nCurriculum import completed successfully:\n"
            f" - Courses: {counts['courses']}\n"
            f" - Modules: {counts['modules']}\n"
            f" - Chapters: {counts['chapters']}\n"
            f" - Lessons: {counts['lessons']}\n"
            f" - Resources: {counts['resources']}"
        ))

        if result.get('errors'):
            self.stdout.write(self.style.WARNING(f"\nEncountered {len(result['errors'])} warnings/errors:"))
            for err in result['errors']:
                self.stdout.write(self.style.ERROR(f" - {err}"))
