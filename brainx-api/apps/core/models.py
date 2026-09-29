import uuid

from django.db import models


class UUIDModel(models.Model):
    """Abstract base: a UUID primary key instead of an autoincrement."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(models.Model):
    """Abstract base: creation and modification timestamps kept automatically."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True