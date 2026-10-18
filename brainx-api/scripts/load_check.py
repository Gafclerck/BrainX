#!/usr/bin/env python3
"""Class-scale load check for the lesson read paths (Story 5.6, AC 7).

Drives a fixed workload of ~20 parallel authenticated readers over the two
lesson-level read surfaces - `browse/chapters/<id>/lessons/` and
`search/lessons/` - against an app served locally, and prints the measured
p95 for each leg against the 500ms target the story sets. Stdlib only: it
talks to the API exactly like any other HTTP client, so it can never import
the project, touch the database, or distort what it measures.

Concurrency is fixed at 20 workers and the workload is fixed at
`REQUESTS_PER_LEG` requests per leg - four legs in one interleaved plan:
browse and search unbounded, plus a bounded browse and a bounded search
that carry `BOUNDED_WINDOW`, so the Story 5.6 date-filtered query shape is
measured alongside the unfiltered one. None of it is configurable, which is
what makes the recorded numbers comparable between runs.

Usage (with the app served locally):

    python manage.py runserver
    LOAD_CHECK_TOKEN=<jwt> python scripts/load_check.py

The API exposes no login route, so the bearer token is supplied by the
caller. It can be minted for an existing account from the shell:

    python manage.py shell -c \\
        "from rest_framework_simplejwt.tokens import AccessToken; \\
         from django.contrib.auth import get_user_model; \\
         print(AccessToken.for_user(get_user_model().objects.first()))"

Exit status: 0 when all four p95 figures are at or under 500ms, 1 when any
exceeds it or a runtime prerequisite fails (nothing to load, server
unreachable, rejected token) - a shortfall still prints its numbers so it
can be recorded; a missing token is an argparse usage error, exiting 2.
"""

import argparse
import http.client
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

# Mirrors `API_PREFIX` in config/settings/base.py; the script speaks HTTP,
# so it cannot read the setting itself.
API_PREFIX = '/api/v1'

DEFAULT_BASE_URL = 'http://127.0.0.1:8000'

# The fixed class-scale workload: 20 parallel readers over four legs of
# the interleaved plan, each leg receiving `REQUESTS_PER_LEG` requests.
WORKERS = 20
REQUESTS_PER_LEG = 100

# The fixed window the two bounded legs send: inside the seeded dataset's
# date spread, so it selects a proper subset of rows on both surfaces.
BOUNDED_WINDOW = {
    'course_date_from': '2026-09-15',
    'course_date_to': '2026-09-20',
}

# The p95 target Story 5.6 AC 7 sets for both surfaces.
TARGET_P95_MS = 500.0

TIMEOUT_SECONDS = 30


class LoadCheckError(Exception):
    """A prerequisite the check could not satisfy, or a non-200 answer."""


def build_url(base_url, path, params=None):
    url = base_url.rstrip('/') + path
    if params:
        url = f'{url}?{urllib.parse.urlencode(params)}'
    return url


def request_url(base_url, token, path, params=None):
    return urllib.request.Request(
        build_url(base_url, path, params),
        headers={
            'Accept': 'application/json',
            'Authorization': f'Bearer {token}',
        },
    )


def get_json(base_url, token, path, params=None):
    """One authenticated GET during discovery, or the reason it failed."""
    try:
        with urllib.request.urlopen(
            request_url(base_url, token, path, params),
            timeout=TIMEOUT_SECONDS,
        ) as response:
            body = response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', 'replace')[:300]
        raise LoadCheckError(
            f'{path} answered {error.code}: {detail}'
        ) from None
    except urllib.error.URLError as error:
        raise LoadCheckError(
            f'{path} is unreachable: {error.reason}'
        ) from None
    except TimeoutError as error:
        raise LoadCheckError(f'{path} timed out: {error}') from None
    except (OSError, http.client.HTTPException) as error:
        # Transport failures outside the three shapes above still must not
        # escape as tracebacks: a mid-body stall on some platforms, a
        # `ConnectionResetError` (an `OSError` that is not a `URLError`),
        # or a protocol-level `HTTPException` raised during `read()`.
        raise LoadCheckError(f'{path} request failed: {error}') from None
    except ValueError as error:
        # `urlopen` rejects a schemeless base URL with `ValueError`
        # ('unknown url type'), which is not an `OSError`; without this arm
        # it would escape `main()`'s `LoadCheckError` handler as a traceback.
        raise LoadCheckError(
            f'{path} could not be opened as a URL: {error}'
        ) from None
    try:
        return json.loads(body.decode('utf-8'))
    except ValueError as error:
        # `JSONDecodeError` (a non-JSON body) and `UnicodeDecodeError` (an
        # undecodable one) both subclass `ValueError`.
        raise LoadCheckError(
            f'{path} did not answer readable JSON: {error}'
        ) from None


def first_row(payload, what):
    rows = payload.get('results') if isinstance(payload, dict) else None
    if not rows:
        raise LoadCheckError(
            f'no {what} found - seed the database with published lessons '
            'first'
        )
    return rows[0]


def pick_query_term(requested, lessons):
    """The search term: an explicit one, else a word taken from a title."""
    if requested is not None:
        if len(requested.strip()) < 3:
            raise LoadCheckError(
                'the search term must be at least 3 characters'
            )
        return requested.strip()
    for row in lessons:
        for word in row['title'].split():
            if len(word) >= 3:
                return word.lower()
    raise LoadCheckError(
        'no lesson title offers a word of 3+ characters; pass --query'
    )


def discover(base_url, token, requested_query):
    """Resolve the browse path and search parameters from the API itself."""
    course = first_row(
        get_json(base_url, token, f'{API_PREFIX}/browse/courses/'), 'course'
    )
    module = first_row(
        get_json(
            base_url,
            token,
            f'{API_PREFIX}/browse/courses/{course["id"]}/modules/',
        ),
        'module',
    )
    chapter = first_row(
        get_json(
            base_url,
            token,
            f'{API_PREFIX}/browse/modules/{module["id"]}/chapters/',
        ),
        'chapter',
    )
    browse_path = f'{API_PREFIX}/browse/chapters/{chapter["id"]}/lessons/'
    lessons = get_json(base_url, token, browse_path)
    first_row(lessons, 'lesson')

    term = pick_query_term(requested_query, lessons['results'])
    search_path = f'{API_PREFIX}/search/lessons/'
    matches = get_json(base_url, token, search_path, {'query': term})
    if not matches.get('results'):
        raise LoadCheckError(
            f'the term {term!r} matches no lesson - pass --query'
        )
    return browse_path, search_path, term


def timed_get(base_url, token, path, params=None):
    """One measured GET: `(elapsed_ms, status)`; transport failures raise."""
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(
            request_url(base_url, token, path, params),
            timeout=TIMEOUT_SECONDS,
        ) as response:
            response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        status = error.code
    except urllib.error.URLError as error:
        raise LoadCheckError(f'request failed: {error.reason}') from None
    except TimeoutError as error:
        raise LoadCheckError(f'request timed out: {error}') from None
    except (OSError, http.client.HTTPException) as error:
        # As in `get_json`: a `ConnectionResetError` or a mid-`read()`
        # `HTTPException` is a transport failure, not a script bug.
        raise LoadCheckError(f'request failed: {error}') from None
    except ValueError as error:
        # A schemeless base URL makes `urlopen` raise `ValueError`.
        raise LoadCheckError(
            f'could not be opened as a URL: {error}'
        ) from None
    return (time.perf_counter() - started) * 1000.0, status


def run_workload(base_url, token, browse_path, search_path, term):
    """The fixed interleaved workload; returns `{leg: [ms, ...]}`.

    One warm-up request per leg runs first, so the first-hit code paths are
    outside the measured window; each request still opens its own TCP
    connection, so connection setup itself is not excluded.
    """
    legs = (
        ('browse', browse_path, None),
        ('browse+window', browse_path, dict(BOUNDED_WINDOW)),
        ('search', search_path, {'query': term}),
        ('search+window', search_path, {'query': term, **BOUNDED_WINDOW}),
    )
    for _, path, params in legs:
        _, status = timed_get(base_url, token, path, params)
        if status != 200:
            raise LoadCheckError(f'{path} answered {status} during warm-up')

    plan = [entry for _ in range(REQUESTS_PER_LEG) for entry in legs]
    timings = {name: [] for name, _, _ in legs}

    def one(entry):
        name, path, params = entry
        elapsed_ms, status = timed_get(base_url, token, path, params)
        if status != 200:
            raise LoadCheckError(f'{path} answered {status} under load')
        return name, elapsed_ms

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for name, elapsed_ms in pool.map(one, plan):
            timings[name].append(elapsed_ms)
    return timings


def percentile(values, percent):
    """Nearest-rank percentile: deterministic and dependency-free."""
    ordered = sorted(values)
    rank = math.ceil(percent / 100 * len(ordered))
    return ordered[max(rank, 1) - 1]


def report(label, values):
    """Print one leg's figures, return its p95."""
    p50 = percentile(values, 50)
    p95 = percentile(values, 95)
    print(
        f'{label}: requests={len(values)} workers={WORKERS} '
        f'min={min(values):.1f}ms p50={p50:.1f}ms p95={p95:.1f}ms '
        f'max={max(values):.1f}ms'
    )
    return p95


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        '--base-url',
        default=os.environ.get('LOAD_CHECK_BASE_URL', DEFAULT_BASE_URL),
        help='where the app is served (env LOAD_CHECK_BASE_URL)',
    )
    parser.add_argument(
        '--token',
        default=os.environ.get('LOAD_CHECK_TOKEN'),
        help=(
            'a bearer JWT for an authenticated account '
            '(env LOAD_CHECK_TOKEN)'
        ),
    )
    parser.add_argument(
        '--query',
        default=os.environ.get('LOAD_CHECK_QUERY'),
        help='the search term (env LOAD_CHECK_QUERY; default: a title word)',
    )
    args = parser.parse_args(argv)
    if not args.token:
        parser.error(
            'a bearer token is required via --token or LOAD_CHECK_TOKEN'
        )

    try:
        browse_path, search_path, term = discover(
            args.base_url, args.token, args.query
        )
        print(
            f'workload: {WORKERS} parallel readers over '
            f'{REQUESTS_PER_LEG} requests on each of 4 legs '
            f'(browse, browse+window, search, search+window; '
            f'term {term!r})'
        )
        timings = run_workload(
            args.base_url, args.token, browse_path, search_path, term
        )
    except LoadCheckError as error:
        print(f'load check could not run: {error}', file=sys.stderr)
        return 1

    p95s = {
        name: report(name, values) for name, values in timings.items()
    }
    print(f'target: p95 <= {TARGET_P95_MS:.0f}ms on every leg')
    misses = [
        f'{name} p95={p95:.1f}ms'
        for name, p95 in p95s.items()
        if p95 > TARGET_P95_MS
    ]
    if misses:
        print(f'FAIL: {", ".join(misses)} exceeds the target')
        return 1
    print('PASS: every leg is within the target')
    return 0


if __name__ == '__main__':
    sys.exit(main())
