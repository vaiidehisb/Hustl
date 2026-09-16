"""Brief parsing orchestration: cache → Claude (if configured) → rules fallback → explicit field overrides."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import date
from typing import Any

import asyncpg

from app.config import get_settings
from app.modules.brief_parser import claude as claude_parser
from app.modules.brief_parser.rules import parse_with_rules
from app.modules.brief_parser.schema import CONFIDENCE_FIELDS, ParsedBrief
from app.modules.brief_parser.validation import BriefValidationError, normalise_platform, validate_parsed
from app.repositories import parse_cache
from app.schemas.requests import BriefFields, ParseBriefRequest
from app.utils.errors import validation_error
from app.utils.niches import canonical_niche

log = logging.getLogger(__name__)

PARSER_VERSION = "brief-parser-v1"

_client = None


def _get_client():
    global _client
    s = get_settings()
    if _client is None and s.anthropic_api_key:
        _client = claude_parser.make_client(s.anthropic_api_key, s.brief_parser_timeout_seconds)
    return _client


def engine() -> tuple[str, str | None]:
    s = get_settings()
    return ("claude", s.brief_parser_model) if s.anthropic_api_key else ("rules", None)


def compose_text(req: ParseBriefRequest) -> str:
    parts: list[str] = []
    if req.text:
        parts.append(req.text)
    f = req.fields
    if f:
        for value in (f.title, f.description):
            if value:
                parts.append(value)
        if f.requirements:
            parts.append(f.requirements if isinstance(f.requirements, str) else "\n".join(f"- {r}" for r in f.requirements))
    return "\n".join(parts).strip()


def input_hash(req: ParseBriefRequest) -> str:
    eng, model = engine()
    normalised = json.dumps(
        {
            "text": " ".join(req.text.split()) if req.text else None,
            "fields": req.fields.model_dump(mode="json", exclude_none=True) if req.fields else None,
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(f"{PARSER_VERSION}|{eng}|{model or ''}|{normalised}".encode()).hexdigest()


def explicit_overrides(fields: BriefFields) -> tuple[dict[str, Any], list[str]]:
    """Structured fields supplied by the backend are authoritative (high confidence), but still validated."""
    out: dict[str, Any] = {}
    errors: list[dict[str, Any]] = []
    if fields.title:
        out["title"] = " ".join(fields.title.split())[:120]
    if fields.niche:
        raw = [fields.niche] if isinstance(fields.niche, str) else fields.niche
        niches = [canonical_niche(n) for n in raw]
        if any(n is None for n in niches):
            errors.append({"loc": ["fields", "niche"], "msg": f"unknown niche in {raw}"})
        out["niche"] = [n for n in dict.fromkeys(niches) if n]
    if fields.platforms is not None:
        mapped = [normalise_platform(p) for p in fields.platforms]
        if any(p is None for p in mapped):
            errors.append({"loc": ["fields", "platforms"], "msg": f"unsupported platform in {fields.platforms}"})
        out["platforms"] = [p for p in dict.fromkeys(mapped) if p]
    if fields.deliverables is not None:
        out["deliverables"] = [d.model_dump() for d in fields.deliverables]
    if fields.requirements:
        reqs = fields.requirements.splitlines() if isinstance(fields.requirements, str) else fields.requirements
        out["requirements"] = [" ".join(r.strip(" -*•").split()) for r in reqs if r.strip(" -*•")][:20]
    if fields.budget is not None:
        if isinstance(fields.budget, (int, float)):
            out["budget"] = {"per_creator": int(fields.budget), "currency": "INR", "total": None}
        else:
            out["budget"] = fields.budget.model_dump()
    if fields.deadline is not None:
        out["deadline"] = fields.deadline.isoformat()
    if errors:
        raise validation_error("Invalid brief fields", errors)
    return out, list(out)


async def parse_brief(pool: asyncpg.Pool | None, req: ParseBriefRequest, today: date | None = None) -> dict[str, Any]:
    eng, model = engine()
    key = input_hash(req)
    warnings: list[str] = []

    if pool is not None:
        try:
            hit = await parse_cache.get(pool, key)
            if hit:
                return {**hit["result"], "cached": True}
        except (asyncpg.PostgresError, OSError) as exc:
            log.warning("brief parse cache read failed: %s", exc)
    else:
        warnings.append("parse cache unavailable (database not reachable)")

    text = compose_text(req)
    parsed: ParsedBrief | None = None
    source = "rules"
    fallback_reason: dict[str, Any] | None = None

    client = _get_client()
    if client is not None and text:
        try:
            parsed, w = await claude_parser.parse_with_claude(client, model or "", text, today)
            warnings += w
            source = "claude"
        except claude_parser.ClaudeParseError as exc:
            log.warning("Claude brief parse failed (%s); using rules", exc.reason)
            fallback_reason = {"reason": exc.reason, "details": exc.details}

    if parsed is None:
        try:
            parsed, w = validate_parsed(parse_with_rules(text, today), today)
            warnings += w
        except BriefValidationError as exc:  # rule parser output should always validate
            raise validation_error("Rule parser produced invalid output", exc.errors) from exc

    result = parsed.model_dump(mode="json")
    if req.fields:
        overrides, keys = explicit_overrides(req.fields)
        merged = {**result, **overrides}
        merged["confidence"] = {**result["confidence"], **{k: "high" for k in keys if k in CONFIDENCE_FIELDS}}
        try:
            final, w = validate_parsed(merged, today)
        except BriefValidationError as exc:
            raise validation_error("Invalid brief fields", exc.errors) from exc
        warnings += w
        result = final.model_dump(mode="json")
        # validate_parsed may lower confidence for soft warnings; explicit values stay high unless flagged
        for k in keys:
            if k in CONFIDENCE_FIELDS and result["confidence"].get(k) != "low":
                result["confidence"][k] = "high"

    response: dict[str, Any] = {
        **result,
        "source": source,
        "model": model if source == "claude" else None,
        "parser_version": PARSER_VERSION,
        "warnings": list(dict.fromkeys(warnings)),
    }
    if fallback_reason:
        response["fallback_reason"] = fallback_reason

    # Cache only results produced by the configured engine (never cache a transient fallback).
    if pool is not None and source == eng:
        try:
            await parse_cache.put(pool, key, source, response["model"], response)
        except (asyncpg.PostgresError, OSError) as exc:
            log.warning("brief parse cache write failed: %s", exc)
    return {**response, "cached": False}
