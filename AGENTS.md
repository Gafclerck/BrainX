<!-- bmad:context -->
<!-- Verified 2026-09-28 against ea120ef. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## Orientation

BrainX is a learning platform that centralizes school courses and resources, so students reach lessons, documents, images and video in one place. This repo is its API: Django 6.1 + DRF + SimpleJWT + drf-spectacular, all code under `brainx-api/`. Developed on a Windows host at `D:\BrainX` while the agent sees a mirrored checkout at `/mnt/d/BrainX`. Planning artifacts land in `_bmad-output/`.

## Policy

- Never commit `.agents/`, `.opencode/`, `_bmad/`, `_bmad-output/` - the root `.gitignore` excludes them.
- Never let `brainx-api/.env` values reach a commit, a diff, or a document - it holds `SECRET_KEY`.

## Where things are

- All application code is under `brainx-api/`: Django project `config/`, apps in `brainx-api/apps/<name>/`.
- Settings split into `config/settings/{base,development,production}.py` - shared values and the app lists in `base.py`, environment overrides in the other two.
- A new endpoint declares its routes in `brainx-api/apps/<app>/urls.py` and is mounted from `config/urls.py`.

## Running and verifying

- Develop and run on Windows in `D:\BrainX\brainx-api` with the existing `.venv` (activate it, or call `.\.venv\Scripts\python.exe`). Nothing is runnable from the Linux checkout at `/mnt/d/BrainX` - the venv there is a Windows build and Django is not importable.
- `python manage.py <cmd>` needs no env var: `manage.py` defaults `DJANGO_SETTINGS_MODULE` to `config.settings.development`.
- `brainx-api/.env` must contain `SECRET_KEY` before any command runs - it has no default and there is no `.env.example`.
- Tests: `python manage.py test`. pytest is not installed and is not the runner.
- No linter, formatter, or CI is configured - do not report a check you did not run.

## Conventions that differ from defaults

- Comments and docstrings in English. `config/settings/*.py` is still French - migrate a file as you touch it; leave `LANGUAGE_CODE` and `TIME_ZONE` alone.
- Register a new app in `LOCAL_APPS` in `brainx-api/config/settings/base.py`, not in `INSTALLED_APPS`, then wire its urls in `config/urls.py`.
- Mount endpoints under `API_PREFIX` from `base.py`; never write `/api/v1` as a literal - it is the version contract.
- Models inherit `UUIDModel` and `TimeStampedModel` from `brainx-api/apps/core/models.py` - UUID primary keys, not autoincrement.
- DRF is JSON-only with JWT and `IsAuthenticated` by default, pinned in `base.py`; do not re-add the browsable API or session auth.

## Known pitfalls

- `brainx-api/requirements.txt` is UTF-16LE with CRLF, so `pip install -r` cannot read it - decode with `iconv -f UTF-16LE -t UTF-8` before editing.
- That file also omits `whitenoise`, `channels`, `channels-redis`, `django-storages` and `boto3`, all imported by `config/settings/` - a fresh install is incomplete.
- `base.py` claims tests get an in-memory channel layer; no such override exists, so anything touching channels reaches for Redis.
- `brainx-api/.gitignore` lists `AGENTS.md` - this file is safe at the repo root, but a copy dropped inside `brainx-api/` would be silently untracked.

<!-- /bmad:context -->
