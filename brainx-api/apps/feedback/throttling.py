from rest_framework.throttling import AnonRateThrottle


class FeedbackAnonRateThrottle(AnonRateThrottle):
    """Bounds anonymous feedback submissions per IP address to mitigate spam."""

    rate = '10/minute'
