from django.db import models
from apps.core.models import TimeStampedModel, UUIDModel


class Feedback(UUIDModel, TimeStampedModel):
    """Anonymous user feedback, suggestions, recommendations and bug reports."""

    class Category(models.TextChoices):
        BUG = 'bug', 'Signalement de bug'
        SUGGESTION = 'suggestion', 'Suggestion'
        RECOMMENDATION = 'recommendation', 'Recommandation'
        OTHER = 'other', 'Autre'

    class Status(models.TextChoices):
        NEW = 'new', 'Nouveau'
        READ = 'read', 'Lu'
        PROCESSED = 'processed', 'Traité'
        ARCHIVED = 'archived', 'Archivé'

    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.SUGGESTION,
    )
    subject = models.CharField(
        max_length=255,
        blank=True,
        default='',
    )
    message = models.TextField()
    page_url = models.CharField(
        max_length=500,
        blank=True,
        default='',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
        db_index=True,
    )
    admin_notes = models.TextField(
        blank=True,
        default='',
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', '-created_at']),
        ]

    def __str__(self):
        title = self.subject or self.message[:30]
        return f'[{self.get_category_display()}] {title} ({self.get_status_display()})'
