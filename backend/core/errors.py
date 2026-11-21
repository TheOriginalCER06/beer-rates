class AppError(Exception):
    """
    An expected, user-facing error.

    `code` is a stable identifier the frontend translates (see frontend/src/locales/*.json,
    `errors.<CODE>`); `message` is an English fallback and may carry API details.
    Extra keyword `params` are sent alongside the code (GraphQL `extensions`) and can be
    used by the translation, e.g. `{{minutes}}`.
    """

    def __init__(self, code: str, message: str | None = None, **params):
        super().__init__(message or code)
        self.code = code
        self.message = message or code
        self.params = params
