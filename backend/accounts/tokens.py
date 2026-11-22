from django.contrib.auth.models import AnonymousUser

from .models import ApiToken


class BearerTokenMiddleware:
    """
    Logs in requests that carry `Authorization: Bearer <token>` (the Android and iOS apps).

    Such requests don't use cookies, so CSRF doesn't apply to them. A request with an unknown or
    expired token is treated as anonymous, never as the session's user.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        request.api_token = None
        if header[:7].lower() == "bearer ":
            token = ApiToken.authenticate(header[7:].strip())
            request._dont_enforce_csrf_checks = True
            if token is None:
                request.user = AnonymousUser()
            else:
                request.user = token.user
                request.api_token = token
        return self.get_response(request)
