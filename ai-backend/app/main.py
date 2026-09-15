"""hustl. AI backend — internal FastAPI service (matching, scoring, brief parsing, fraud)."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.deps import require_internal_token
from app.api.routes import ai, health
from app.config import get_settings
from app.db.bootstrap import ensure_ready
from app.db.pool import close_pool
from app.utils.errors import AppError

log = logging.getLogger("hustl.ai")

HTTP_CODES = {400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND",
              405: "METHOD_NOT_ALLOWED", 409: "CONFLICT", 422: "VALIDATION_ERROR", 429: "RATE_LIMITED"}


def _error(status: int, code: str, message: str, details=None) -> JSONResponse:
    return JSONResponse(status_code=status,
                        content={"success": False, "error": {"code": code, "message": message, "details": details}})


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=get_settings().log_level)
    try:
        await ensure_ready()
        log.info("database ready; ai schema migrated")
    except Exception as exc:  # noqa: BLE001 — boot anyway; /health reports it and requests retry
        log.warning("database not ready at startup: %s", exc)
    yield
    await close_pool()


def create_app() -> FastAPI:
    app = FastAPI(title="hustl. AI backend", version="1.0.0", lifespan=lifespan,
                  docs_url="/docs", redoc_url=None)

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _error(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [{"loc": list(e.get("loc", [])), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()]
        return _error(422, "VALIDATION_ERROR", "Request validation failed", details)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _error(exc.status_code, HTTP_CODES.get(exc.status_code, "HTTP_ERROR"), str(exc.detail))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error")
        return _error(500, "INTERNAL_ERROR", "Internal server error")

    app.include_router(health.router)
    app.include_router(ai.router, dependencies=[Depends(require_internal_token)])
    return app


app = create_app()
