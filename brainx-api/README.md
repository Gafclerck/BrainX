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
  body has been read.
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
- `GET /api/v1/resources/<resource_id>/retrieval/` - a verified Student's
  retrieval of one stored document or image. Resolves the Resource and its
  parent Lesson through the Student port (`visible()`), so a hidden or missing
  row is a `404`; `video`/`external_link` are `404` too. Returns a 3600 s
  object-scoped URL plus the server-derived `content_type` and `filename`
  (`slugify(title)` + stored extension), and applies `inline` or `attachment`
  from the `disposition` query parameter (default `inline`); any other value is
  a `400` naming `disposition`. Under S3 the Content-Type/Content-Disposition
  overrides ride on the signed URL; local development storage returns a plain
  URL. No file bytes pass through the API.
- Everything else under `API_PREFIX` requires JWT authentication.
- The Django admin is not mounted and `django.contrib.admin` is not installed.
  Unmatched routes and `/admin/` return the project's five-key 404 envelope.

## Resource types

A Resource is discriminated by `type`, and the type decides the payload shape:
a `file` for the file types or a `url` for the URL types. Within the URL types,
`type` carries only the intent - `video` versus `external_link`. The line BrainX
draws is between what it stores and what it only points at.

- `video` is an external embed only. BrainX never uploads, stores, transcodes
  or streams video bytes; the Resource carries a `url` and its metadata
  (`title`, `note`), never bytes or a `file`. That URL is a plain JSON field -
  stored and returned verbatim, never interpolated into markup. There is no
  offline or download affordance for a `video`: a documented limitation, not a
  gap. If the host is unavailable the Lesson still opens; the client shows its
  own unavailable state.
- `external_link` stores a URL verbatim too and is distinct from `video` by
  `type` alone (`type` is the only discriminator). That a reader opens the new
  destination is the SPA's behaviour, not an API contract.
- Both URL types require a `url` (a missing or cleared one is a `400` naming
  `url`) and accept only `http://` or `https://` addresses, enforced by the
  `validate_http_url` write validator and the `resource_url_is_http` database
  CHECK; they refuse a `file` on create or update with a `400` naming `file`.
- The API does not crawl or validate reachability, and never gates, defers or
  fails a Lesson response on whether the host answers - reachability is not a
  server concern.
- The unavailable-video state and any network-filter behaviour are the SPA's
  responsibility, not the API's.

A `document` or `image` Resource is the opposite case: a file BrainX stores,
retrievable through the signed-URL route above.
