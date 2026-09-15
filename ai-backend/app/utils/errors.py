"""Error types matching the Node services' envelope: {success:false, error:{code,message,details}}."""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


def not_found(entity: str, entity_id: object) -> AppError:
    return AppError(404, "NOT_FOUND", f"{entity} not found", {"id": str(entity_id)})


def validation_error(message: str, details: Any = None) -> AppError:
    return AppError(422, "VALIDATION_ERROR", message, details)


def forbidden(message: str = "Forbidden") -> AppError:
    return AppError(403, "FORBIDDEN", message)


def integration_unavailable(service: str, missing_env: list[str] | None = None, reason: str | None = None) -> AppError:
    details: dict[str, Any] = {"service": service}
    if missing_env:
        details["missingEnv"] = missing_env
    if reason:
        details["reason"] = reason
    return AppError(503, "INTEGRATION_UNAVAILABLE", f"{service} is not available", details)


def ok(data: Any, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"success": True, "data": data}
    if meta is not None:
        body["meta"] = meta
    return body
