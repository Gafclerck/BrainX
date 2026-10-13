# BrainX API

Django + DRF API for the BrainX learning platform. All commands run from
`brainx-api/` in the project virtualenv:

```
python manage.py check
python manage.py test --noinput
```

## Operational envelope

The deployment contract the code enforces or assumes. Keep it in sync with
`config/settings/production.py` and `config/settings/base.py`.

- **Boot guards.** `config.settings.production` refuses to boot unless
  `STORAGE_BACKEND` is `s3`, `EMAIL_BACKEND` is a backend that actually
  delivers (the console, locmem, dummy and filebased sinks are refused), the
  scoped throttle class is installed, and all five required throttle scopes
  declare a non-`None` rate. A misconfigured deployment fails at import,
  rather than on the first request.
- **Single TLS edge.** The platform host sits behind one TLS-terminating edge
  that forwards `X-Forwarded-Proto`; `SECURE_PROXY_SSL_HEADER` is what keeps
  `SECURE_SSL_REDIRECT` from looping. Throttle identity is taken from
  `REMOTE_ADDR`, never from `X-Forwarded-For`.
- **Managed Redis.** The channel layer points at a managed Redis
  (`CHANNEL_REDIS_URL`, `channels_redis`), with `socket_timeout: None` on every
  host for the redis-py 8.x blocking-read workaround.
- **Upload caps.** The edge is the only pre-parse bound: it must reject a
  request body over 50 MB. In process, `DATA_UPLOAD_MAX_MEMORY_SIZE` (50 MB)
  caps the non-file body and `FILE_UPLOAD_MAX_MEMORY_SIZE` (2.5 MB, Django's
  default) only decides when an upload spools from memory to a temp file -
  neither rejects a file. The Resource serializer is the authoritative per-file
  cap, checking the 50 MB ceiling and the per-type extension allowlist once the
  body has been read. Stored documents and images cannot be fetched back
  through the API in this version; authenticated retrieval is a later story.
- **Migrations at release.** Migrations are applied during release, never at
  build: the process that serves traffic is not the process that migrates.
- **Secret hygiene.** `SECRET_KEY` has no default and is read from the
  environment; `.env` is git-ignored and its values never reach a commit, a
  diff, a test fixture or a document.

## Routes

- `GET /api/v1/healthz/` - liveness. The single documented unauthenticated API
  route that returns application data; returns `{"status": "ok"}` and nothing
  else.
- `GET /api/v1/schema/` and `GET /api/v1/docs/` - drf-spectacular schema and
  Swagger UI; intentionally served anonymously per project configuration
  (see `config/urls.py` and `SPECTACULAR_SETTINGS`) to describe the contract
  without requiring credentials.
- Everything else under `API_PREFIX` requires JWT authentication.
- The Django admin is not mounted and `django.contrib.admin` is not installed.
  Unmatched routes and `/admin/` return the project's five-key 404 envelope.
