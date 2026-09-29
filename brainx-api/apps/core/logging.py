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
        if record.exc_info:
            # The 5xx path is the one that passes exc_info, and dropping it
            # would lose the traceback the text formatter used to emit.
            payload['exception'] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=True)
