import uuid

from django.db import models


class UUIDModel(models.Model):
    """Base abstraite : clé primaire UUID au lieu d'un autoincrement."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(models.Model):
    """Base abstraite : horodatage automatique de création et de modification."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True