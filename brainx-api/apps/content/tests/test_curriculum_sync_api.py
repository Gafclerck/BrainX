"""Tests for CurriculumSyncView API endpoint (POST /api/v1/curriculum/sync/)."""

import tempfile
from pathlib import Path
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User


class CurriculumSyncApiTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.student = User.objects.create_user(
            email='student@brainx.local',
            password='Password123!',
            is_publisher=False,
            is_email_verified=True,
        )
        cls.publisher = User.objects.create_user(
            email='publisher_api@brainx.local',
            password='Password123!',
            is_publisher=True,
            is_email_verified=True,
        )

    def test_curriculum_sync_anonymous_401(self):
        response = self.client.post('/api/v1/curriculum/sync/', {})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_curriculum_sync_student_forbidden_403(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post('/api/v1/curriculum/sync/', {})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_curriculum_sync_publisher_success(self):
        self.client.force_authenticate(user=self.publisher)

        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            course_dir = root / "01-Cloud"
            module_dir = course_dir / "01-DevOps"
            chapter_dir = module_dir / "01-CI-CD"
            chapter_dir.mkdir(parents=True)

            lesson_file = chapter_dir / "01-Docker.md"
            lesson_file.write_text(
                """---
title: "Docker et Conteneurisation"
teacher: "Solomon Hykes"
course_date: "2026-11-20"
tags:
  - Docker
  - DevOps
---
Introduction aux conteneurs Docker.
""",
                encoding="utf-8",
            )

            # Test dry_run
            response = self.client.post(
                '/api/v1/curriculum/sync/',
                {'path': str(root), 'dry_run': True},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            data = response.json()
            self.assertEqual(data['status'], 'success')
            self.assertTrue(data['dry_run'])
            self.assertEqual(data['counts']['courses'], 1)
            self.assertEqual(data['counts']['lessons'], 1)

            # Real run
            response = self.client.post(
                '/api/v1/curriculum/sync/',
                {'path': str(root), 'dry_run': False},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            data = response.json()
            self.assertEqual(data['status'], 'success')
            self.assertFalse(data['dry_run'])
            self.assertEqual(data['counts']['courses'], 1)
            self.assertEqual(data['counts']['lessons'], 1)
