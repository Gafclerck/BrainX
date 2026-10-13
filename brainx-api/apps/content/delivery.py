"""Delivery helpers for Resource retrieval (Story 3.3).

The `Content-Type` and the download filename are derived server-side from the
Resource and its stored file, never from the uploaded `file.content_type`: the
type comes from the fixed per-type content-type map in settings, and the
filename from `slugify(title)` plus the stored extension. `build_signed_url`
asks the storage for a short-lived URL and, on S3, carries the response
overrides that make the object render with the server-chosen type and
disposition; local development storage cannot sign and returns its plain URL.
"""
from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.utils.text import slugify

from .models import Resource


def _extension(resource: Resource) -> str:
    """The stored file's lowercased extension, including the dot."""
    return Path(resource.file.name).suffix.lower()


def derive_content_type(resource: Resource) -> str:
    """Return the Content-Type to serve for this file-bearing Resource.

    Never trusts the uploaded `file.content_type`; looks the extension up in
    the fixed per-type map so an unknown type or extension falls back to a
    neutral binary type rather than reflecting the upload.
    """
    by_type = settings.RESOURCE_CONTENT_TYPES.get(resource.type, {})
    return by_type.get(_extension(resource), 'application/octet-stream')


def derive_filename(resource: Resource) -> str:
    """Return the filename: slugify(title) plus the stored extension."""
    stem = slugify(resource.title) or 'resource'
    return f'{stem}{_extension(resource)}'


def build_signed_url(resource: Resource, disposition: str = 'inline') -> str:
    """Build the retrieval URL for the Resource's file.

    On S3 the URL is signed for `RESOURCE_URL_TTL_SECONDS` and carries
    `ResponseContentType`/`ResponseContentDisposition` so the browser renders
    the file with the server-derived type and disposition. Local development
    storage cannot sign or apply response overrides, so it returns its plain
    URL; production refuses anything but S3 (production.py boot guard).
    """
    if not resource.file:
        return ''

    storage = resource.file.storage
    name = resource.file.name

    if settings.STORAGE_BACKEND != 's3':
        return storage.url(name)

    parameters = {
        'ResponseContentType': derive_content_type(resource),
        'ResponseContentDisposition': (
            f'{disposition}; filename="{derive_filename(resource)}"'
        ),
    }
    return storage.url(
        name,
        expire=settings.RESOURCE_URL_TTL_SECONDS,
        parameters=parameters,
    )
