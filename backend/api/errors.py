import logging

from django.conf import settings
from graphql.error import GraphQLError
from strawberry.extensions import MaskErrors

from core.errors import AppError

logger = logging.getLogger(__name__)


class AppErrors(MaskErrors):
    """
    Exposes `AppError.code` as `extensions.code` so the frontend can translate errors,
    and hides unexpected exceptions (outside DEBUG) behind a generic INTERNAL_ERROR.
    """

    def __init__(self) -> None:
        super().__init__(error_message="Unexpected error.")

    def _process_errors(self, errors: list[GraphQLError]) -> list[GraphQLError]:
        processed = []
        for error in errors:
            original = error.original_error
            if isinstance(original, AppError):
                processed.append(self._with_code(error, original.message, original.code, original, original.params))
            elif original is not None and not settings.DEBUG:
                processed.append(self._with_code(error, self.error_message, "INTERNAL_ERROR", None))
            else:
                processed.append(error)
        return processed

    @staticmethod
    def _with_code(
        error: GraphQLError, message: str, code: str, original: Exception | None, params: dict | None = None
    ) -> GraphQLError:
        return GraphQLError(
            message=message,
            nodes=error.nodes,
            source=error.source,
            positions=error.positions,
            path=error.path,
            original_error=original,
            extensions={"code": code, **(params or {})},
        )
