"""Celery application. Broker and result backend are REDIS_URL.

Run a worker: celery -A app.workers.celery_app worker --loglevel=INFO
"""

from __future__ import annotations

from celery import Celery

from app.config import get_settings

_settings = get_settings()
_broker = _settings.redis_url or "memory://"

celery_app = Celery(
    "hustl_ai",
    broker=_broker,
    backend=_settings.redis_url or "cache+memory://",
    include=["app.workers.tasks"],
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    result_expires=24 * 3600,
    task_track_started=True,
)
