from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.feedback.models import Feedback
from apps.users.models import User


class FeedbackCreateTests(APITestCase):
    def setUp(self):
        self.url = '/api/v1/feedback/'

    def test_anonymous_user_can_submit_feedback(self):
        payload = {
            'category': 'bug',
            'subject': 'Bouton de téléchargement cassé',
            'message': 'Le bouton de téléchargement du PDF de la leçon 3 ne répond pas.',
            'page_url': '/lessons/123',
        }
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('id', response.data)
        self.assertEqual(response.data['status'], 'new')
        self.assertEqual(response.data['category'], 'bug')

        # Verify DB entry
        feedback = Feedback.objects.get(id=response.data['id'])
        self.assertEqual(feedback.subject, 'Bouton de téléchargement cassé')
        self.assertEqual(feedback.status, Feedback.Status.NEW)
        self.assertEqual(feedback.page_url, '/lessons/123')

    def test_message_validation_rejects_empty_or_too_short(self):
        payload = {
            'category': 'suggestion',
            'message': 'ab',
        }
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('message', response.data['errors'])

    def test_honeypot_catches_bot_submission(self):
        payload = {
            'category': 'suggestion',
            'message': 'Je suggère un mode sombre pour la lecture.',
            'hp_code': 'I am a spambot',
        }
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Feedback.objects.count(), 0)

    def test_default_category_is_suggestion(self):
        payload = {
            'message': 'Superbe interface, merci !',
        }
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        feedback = Feedback.objects.get(id=response.data['id'])
        self.assertEqual(feedback.category, Feedback.Category.SUGGESTION)


class FeedbackAdminTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # Regular student
        cls.student = User.objects.create_user(
            email='student@example.com',
            password='Password123!',
            is_email_verified=True,
        )
        # Superadmin
        cls.superadmin = User.objects.create_superuser(
            email='admin@example.com',
            password='AdminPassword123!',
            is_email_verified=True,
        )
        # Publisher
        cls.publisher = User.objects.create_user(
            email='publisher@example.com',
            password='PublisherPassword123!',
            is_email_verified=True,
            is_publisher=True,
        )

    def setUp(self):
        self.list_url = '/api/v1/admin/feedback/'
        self.stats_url = '/api/v1/admin/feedback/stats/'

        self.f1 = Feedback.objects.create(
            category=Feedback.Category.BUG,
            subject='Bug dans quiz',
            message='Impossible de soumettre le quiz.',
            status=Feedback.Status.NEW,
        )
        self.f2 = Feedback.objects.create(
            category=Feedback.Category.SUGGESTION,
            subject='Ajouter des sous-titres',
            message='Ce serait super pour les vidéos.',
            status=Feedback.Status.READ,
        )
        self.f3 = Feedback.objects.create(
            category=Feedback.Category.RECOMMENDATION,
            subject='Cours de physique',
            message='Ajoutez un cours de thermodynamique.',
            status=Feedback.Status.PROCESSED,
        )

    def test_anonymous_access_to_admin_list_is_refused(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_regular_student_access_is_forbidden(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_superadmin_can_list_all_feedback(self):
        self.client.force_authenticate(user=self.superadmin)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Check standard PageNumberPagination results
        self.assertEqual(response.data['count'], 3)
        results = response.data['results']
        self.assertEqual(len(results), 3)

    def test_publisher_can_also_access_admin_list(self):
        self.client.force_authenticate(user=self.publisher)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 3)

    def test_filter_by_status(self):
        self.client.force_authenticate(user=self.superadmin)
        response = self.client.get(self.list_url, {'status': 'new'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.f1.id))

    def test_filter_by_category(self):
        self.client.force_authenticate(user=self.superadmin)
        response = self.client.get(self.list_url, {'category': 'suggestion'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.f2.id))

    def test_search_by_keyword(self):
        self.client.force_authenticate(user=self.superadmin)
        response = self.client.get(self.list_url, {'search': 'thermodynamique'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.f3.id))

    def test_stats_endpoint(self):
        self.client.force_authenticate(user=self.superadmin)
        response = self.client.get(self.stats_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total'], 3)
        self.assertEqual(response.data['new'], 1)
        self.assertEqual(response.data['read'], 1)
        self.assertEqual(response.data['processed'], 1)

    def test_mark_feedback_as_read_and_processed(self):
        self.client.force_authenticate(user=self.superadmin)
        detail_url = f'/api/v1/admin/feedback/{self.f1.id}/'

        # Mark as read
        patch_res = self.client.patch(detail_url, {'status': 'read'}, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.f1.refresh_from_db()
        self.assertEqual(self.f1.status, Feedback.Status.READ)

        # Mark as processed with admin notes
        patch_res = self.client.patch(
            detail_url,
            {'status': 'processed', 'admin_notes': 'Bug corrigé dans le composant Quiz.'},
            format='json',
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.f1.refresh_from_db()
        self.assertEqual(self.f1.status, Feedback.Status.PROCESSED)
        self.assertEqual(self.f1.admin_notes, 'Bug corrigé dans le composant Quiz.')

    def test_delete_feedback(self):
        self.client.force_authenticate(user=self.superadmin)
        detail_url = f'/api/v1/admin/feedback/{self.f1.id}/'
        del_res = self.client.delete(detail_url)
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Feedback.objects.filter(id=self.f1.id).exists())
