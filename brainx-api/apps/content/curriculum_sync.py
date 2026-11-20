"""Service module to synchronize curriculum courses, modules, chapters, lessons, and resources.

This service is used by both the Django management command `import_curriculum`
and the Publisher API endpoint `POST /api/v1/curriculum/sync/`.
"""

import os
import re
from datetime import date, datetime
from pathlib import Path
from typing import Callable, Optional
import yaml

from django.core.files import File
from django.db import transaction

from apps.content.models import Chapter, Course, Lesson, Module, Resource
from apps.users.models import User


def parse_clean_name(name: str) -> str:
    """Strip leading numbers like '01-' and replace underscores/hyphens with spaces."""
    cleaned = re.sub(r'^\d+[\-_.]\s*', '', name)
    return cleaned.replace('_', ' ').replace('-', ' ').strip()


def extract_frontmatter_and_body(content: str) -> tuple[dict, str]:
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


def resolve_default_publisher(email: Optional[str] = None) -> User:
    """Resolve or create an author account with publisher privileges."""
    publisher = None
    if email:
        publisher = User.objects.filter(email=email).first()

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

    return publisher


def sync_curriculum(
    curriculum_path: Path | str,
    publisher: Optional[User] = None,
    dry_run: bool = False,
    logger: Optional[Callable[[str], None]] = None,
) -> dict:
    """Synchronize curriculum folder into PostgreSQL database.

    Args:
        curriculum_path: Path to the curriculum folder.
        publisher: Publisher user to stamp on rows. If None, resolves default publisher.
        dry_run: If True, simulates import and rolls back all database writes.
        logger: Optional log function (e.g. self.stdout.write or logging.info).

    Returns:
        Dict with status, counts, and errors.
    """
    def log(msg: str):
        if logger:
            logger(msg)

    path = Path(curriculum_path)
    if not path.is_absolute():
        path = Path(os.getcwd()) / path

    if not path.exists() or not path.is_dir():
        return {
            'status': 'error',
            'detail': f"Répertoire curriculum introuvable: {path}",
            'counts': {'courses': 0, 'modules': 0, 'chapters': 0, 'lessons': 0, 'resources': 0},
            'errors': [f"Directory not found: {path}"],
        }

    if not publisher:
        publisher = resolve_default_publisher()

    counts = {
        'courses': 0,
        'modules': 0,
        'chapters': 0,
        'lessons': 0,
        'resources': 0,
    }
    errors: list[str] = []

    log(f"Scanning curriculum from: {path} (dry_run={dry_run})")

    # Scan Level 1: Course folders
    course_dirs = sorted([d for d in path.iterdir() if d.is_dir() and not d.name.startswith('.')])

    for course_idx, c_dir in enumerate(course_dirs, start=1):
        course_name = parse_clean_name(c_dir.name)
        try:
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
                    log(f" [Course +] {course.name}")
                else:
                    if course.position != course_idx:
                        course.position = course_idx
                        course.last_modified_by = publisher
                        course.save(update_fields=['position', 'last_modified_by'])

                # Scan Level 2: Module folders
                module_dirs = sorted([d for d in c_dir.iterdir() if d.is_dir() and not d.name.startswith('.')])
                for module_idx, m_dir in enumerate(module_dirs, start=1):
                    module_name = parse_clean_name(m_dir.name)
                    module = Module.objects.filter(course=course, name=module_name).first()
                    m_created = False
                    if not module:
                        module = Module.objects.filter(course=course, position=module_idx).first()
                        if module:
                            module.name = module_name
                            module.last_modified_by = publisher
                            module.save(update_fields=['name', 'last_modified_by'])
                        else:
                            module = Module.objects.create(
                                course=course,
                                name=module_name,
                                position=module_idx,
                                last_modified_by=publisher,
                            )
                            m_created = True

                    if m_created:
                        counts['modules'] += 1
                        log(f"   [Module +] {module.name}")

                    # Scan Level 3: Chapter folders
                    chapter_dirs = sorted([d for d in m_dir.iterdir() if d.is_dir() and not d.name.startswith('.')])
                    for chapter_idx, ch_dir in enumerate(chapter_dirs, start=1):
                        chapter_name = parse_clean_name(ch_dir.name)
                        chapter = Chapter.objects.filter(module=module, name=chapter_name).first()
                        ch_created = False
                        if not chapter:
                            chapter = Chapter.objects.filter(module=module, position=chapter_idx).first()
                            if chapter:
                                chapter.name = chapter_name
                                chapter.last_modified_by = publisher
                                chapter.save(update_fields=['name', 'last_modified_by'])
                            else:
                                chapter = Chapter.objects.create(
                                    module=module,
                                    name=chapter_name,
                                    position=chapter_idx,
                                    last_modified_by=publisher,
                                    )
                                ch_created = True

                        if ch_created:
                            counts['chapters'] += 1
                            log(f"     [Chapter +] {chapter.name}")

                        # Scan Level 4: Lesson markdown files
                        lesson_files = sorted([f for f in ch_dir.glob('*.md')])
                        for lesson_idx, l_file in enumerate(lesson_files, start=1):
                            try:
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

                                description = body if body.strip() else (metadata.get('description') or f"Leçon sur {title}")

                                # Harmonize tags list and keywords string
                                tags = metadata.get('tags')
                                if isinstance(tags, list):
                                    keywords = ', '.join(str(t) for t in tags)
                                elif isinstance(tags, str):
                                    keywords = tags
                                else:
                                    keywords = metadata.get('keywords') or course_name

                                is_published = bool(metadata.get('is_published', True))

                                lesson = Lesson.objects.filter(chapter=chapter, title=title).first()
                                l_created = False
                                if not lesson:
                                    lesson = Lesson.objects.filter(chapter=chapter, position=lesson_idx).first()
                                    if lesson:
                                        lesson.title = title
                                        lesson.teacher = teacher
                                        lesson.course_date = course_date
                                        lesson.description = description
                                        lesson.keywords = keywords
                                        lesson.is_published = is_published
                                        lesson.last_modified_by = publisher
                                        lesson.save()
                                    else:
                                        lesson = Lesson.objects.create(
                                            chapter=chapter,
                                            title=title,
                                            teacher=teacher,
                                            course_date=course_date,
                                            description=description,
                                            keywords=keywords,
                                            position=lesson_idx,
                                            is_published=is_published,
                                            last_modified_by=publisher,
                                        )
                                        l_created = True
                                else:
                                    lesson.teacher = teacher
                                    lesson.course_date = course_date
                                    lesson.description = description
                                    lesson.keywords = keywords
                                    lesson.is_published = is_published
                                    lesson.last_modified_by = publisher
                                    lesson.save()

                                # Recompute search trigram document
                                lesson.search_document = lesson.compose_search_document()
                                lesson.save(update_fields=['search_document'])

                                if l_created:
                                    counts['lessons'] += 1
                                    log(f"       [Lesson +] {lesson.title}")

                                # Process attached resources
                                resources_list = metadata.get('resources', [])
                                for res_item in resources_list:
                                    res_type = str(res_item.get('type', '')).lower()
                                    res_title = res_item.get('title') or f"Ressource {res_type}"
                                    res_note = res_item.get('note') or res_item.get('description', '')

                                    if res_type in (Resource.Type.VIDEO, Resource.Type.EXTERNAL_LINK):
                                        res_url = res_item.get('url', '')
                                        if res_url:
                                            res, r_created = Resource.objects.get_or_create(
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
                                            elif res.note != res_note:
                                                res.note = res_note
                                                res.last_modified_by = publisher
                                                res.save(update_fields=['note', 'last_modified_by'])

                                    elif res_type in (Resource.Type.DOCUMENT, Resource.Type.IMAGE):
                                        rel_file_path = res_item.get('file', '')
                                        if rel_file_path:
                                            file_abs_path = l_file.parent / rel_file_path
                                            if file_abs_path.exists() and file_abs_path.is_file():
                                                # Check if resource already exists
                                                existing_res = Resource.objects.filter(
                                                    lesson=lesson,
                                                    title=res_title,
                                                    type=res_type,
                                                ).first()

                                                if not existing_res:
                                                    with open(file_abs_path, 'rb') as f:
                                                        Resource.objects.create(
                                                            lesson=lesson,
                                                            title=res_title,
                                                            type=res_type,
                                                            file=File(f, name=file_abs_path.name),
                                                            note=res_note,
                                                            last_modified_by=publisher,
                                                        )
                                                    counts['resources'] += 1
                                                else:
                                                    if existing_res.note != res_note:
                                                        existing_res.note = res_note
                                                        existing_res.last_modified_by = publisher
                                                        existing_res.save(update_fields=['note', 'last_modified_by'])

                            except Exception as lesson_err:
                                err_msg = f"Error processing lesson {l_file}: {lesson_err}"
                                errors.append(err_msg)
                                log(f"       [!] {err_msg}")

                if dry_run:
                    transaction.set_rollback(True)

        except Exception as course_err:
            err_msg = f"Error processing course {c_dir.name}: {course_err}"
            errors.append(err_msg)
            log(f" [!] {err_msg}")

    return {
        'status': 'success' if not errors else 'partial',
        'dry_run': dry_run,
        'counts': counts,
        'errors': errors,
    }
