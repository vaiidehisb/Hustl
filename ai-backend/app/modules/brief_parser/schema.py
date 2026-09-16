"""Brief parser output model (Pydantic) and the JSON schema sent to Claude."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.niches import CANONICAL_NICHES

PLATFORMS: tuple[str, ...] = ("INSTAGRAM", "YOUTUBE", "TIKTOK", "LINKEDIN", "X")
Platform = Literal["INSTAGRAM", "YOUTUBE", "TIKTOK", "LINKEDIN", "X"]
Confidence = Literal["high", "medium", "low"]

CONFIDENCE_FIELDS: tuple[str, ...] = (
    "title", "niche", "platforms", "deliverables", "audience", "budget", "creators_needed",
    "deadline", "timeline", "requirements", "location", "min_followers",
)


class Deliverable(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: str = Field(min_length=1, max_length=60)
    quantity: int = Field(ge=1, le=100)


class Budget(BaseModel):
    model_config = ConfigDict(extra="forbid")
    per_creator: int | None = Field(default=None, ge=0, le=100_000_000)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    total: int | None = Field(default=None, ge=0, le=10_000_000_000)


class ParsedBrief(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(max_length=120)
    niche: list[str] = Field(default_factory=list, max_length=5)
    platforms: list[Platform] = Field(default_factory=list)
    deliverables: list[Deliverable] = Field(default_factory=list, max_length=20)
    audience: list[str] = Field(default_factory=list, max_length=10)
    budget: Budget = Field(default_factory=Budget)
    creators_needed: int | None = Field(default=None, ge=1, le=1000)
    deadline: date | None = None
    timeline: str = Field(default="", max_length=200)
    requirements: list[str] = Field(default_factory=list, max_length=20)
    location: list[str] = Field(default_factory=list, max_length=20)
    min_followers: int | None = Field(default=None, ge=0, le=1_000_000_000)
    confidence: dict[str, Confidence] = Field(default_factory=dict)

    @field_validator("niche")
    @classmethod
    def _niche_enum(cls, v: list[str]) -> list[str]:
        bad = [n for n in v if n not in CANONICAL_NICHES]
        if bad:
            raise ValueError(f"unknown niche(s): {bad}")
        return list(dict.fromkeys(v))

    @field_validator("platforms")
    @classmethod
    def _dedupe(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))

    @field_validator("confidence")
    @classmethod
    def _confidence_keys(cls, v: dict[str, str]) -> dict[str, str]:
        unknown = set(v) - set(CONFIDENCE_FIELDS)
        if unknown:
            raise ValueError(f"unknown confidence field(s): {sorted(unknown)}")
        return {k: v.get(k, "low") for k in CONFIDENCE_FIELDS}  # type: ignore[misc]


def _nullable(schema: dict) -> dict:
    return {"anyOf": [schema, {"type": "null"}]}


CONFIDENCE_ENUM = {"type": "string", "enum": ["high", "medium", "low"]}

CLAUDE_OUTPUT_SCHEMA: dict = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "title", "niche", "platforms", "deliverables", "audience", "budget", "creators_needed", "deadline",
        "timeline", "requirements", "location", "min_followers", "confidence",
    ],
    "properties": {
        "title": {"type": "string", "description": "Short campaign title, max 8 words"},
        "niche": {"type": "array", "items": {"type": "string", "enum": list(CANONICAL_NICHES)}},
        "platforms": {"type": "array", "items": {"type": "string", "enum": list(PLATFORMS)}},
        "deliverables": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["type", "quantity"],
                "properties": {
                    "type": {"type": "string", "description": "e.g. Reel, Story, YouTube video, Short, Post"},
                    "quantity": {"type": "integer", "description": "per creator, at least 1"},
                },
            },
        },
        "audience": {"type": "array", "items": {"type": "string"}, "description": "Target audience segments"},
        "budget": {
            "type": "object",
            "additionalProperties": False,
            "required": ["per_creator", "currency", "total"],
            "properties": {
                "per_creator": _nullable({"type": "integer"}),
                "currency": {"type": "string", "description": "ISO 4217 code, INR unless stated"},
                "total": _nullable({"type": "integer"}),
            },
        },
        "creators_needed": _nullable({"type": "integer"}),
        "deadline": _nullable({"type": "string", "description": "ISO date YYYY-MM-DD"}),
        "timeline": {"type": "string"},
        "requirements": {"type": "array", "items": {"type": "string"}},
        "location": {"type": "array", "items": {"type": "string"}},
        "min_followers": _nullable({"type": "integer"}),
        "confidence": {
            "type": "object",
            "additionalProperties": False,
            "required": list(CONFIDENCE_FIELDS),
            "properties": {f: CONFIDENCE_ENUM for f in CONFIDENCE_FIELDS},
        },
    },
}
