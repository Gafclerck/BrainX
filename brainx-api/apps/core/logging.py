"""Structured logging: one JSON object per line on stdout, stdlib only."""

import json
import logging
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """Render a log record as a single JSON line.

    `ensure_ascii=True` escapes every non-ASCII character as ``\\uXXXX`` and
    `json.dumps` escapes the rest, so a newline, a quote or a JSON-looking
    payload coming from a client can never forge or split a log entry. A
    traceback is carried as a string value under `exception`, so its newlines
    are escaped into the line rather than splitting it.
    """

    def format(self, record):
        payload = {
            'timestamp': datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'module': record.module,
            'message': record.getMessage(),
        }
        # The stock Formatter reads exc_info and falls back to the cached
        # exc_text, and appends stack_info; keeping all three is what stops this
        # formatter from silently dropping diagnostics the previous one emitted.
        exception = self._exception_text(record)
        if exception:
            payload['exception'] = exception
        if record.stack_info:
            payload['stack'] = self.formatStack(record.stack_info)
        return json.dumps(payload, ensure_ascii=True)

    def _exception_text(self, record):
        """The traceback for a record, from exc_info or a cached exc_text.

        `exc_info=True` outside an `except` block yields `(None, None, None)`,
        which is truthy, so the exception type is checked rather than the tuple.
        """
        if record.exc_info and record.exc_info[0] is not None:
            # The 5xx path is the one that passes exc_info, and dropping it
            # would lose the traceback the text formatter used to emit.
            return self.formatException(record.exc_info)
        return record.exc_text
