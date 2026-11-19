from django.http import JsonResponse

from .exceptions import not_found_response


def healthz(request):
    """Liveness: the sole unauthenticated route, returning a status and nothing else."""
    return JsonResponse({"status": "ok"})


def handler404(request, exception):
    """Render an unmatched route as the project's five-key 404 envelope.

    Django's base handler calls this before any DRF view runs, so it is not the
    exception handler that answers here; it delegates to the same envelope
    builder that path uses.
    """
    return not_found_response()
