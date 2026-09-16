from __future__ import annotations

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.brief_parser.schema import Budget, Deliverable


class MatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    brief_id: UUID
    limit: int = Field(default=20, ge=1, le=100)


class BriefFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=20_000)
    requirements: str | list[str] | None = None
    budget: int | float | Budget | None = Field(default=None)
    deadline: date | None = None
    platforms: list[str] | None = None
    niche: str | list[str] | None = None
    deliverables: list[Deliverable] | None = None

    @model_validator(mode="after")
    def _non_negative_budget(self) -> "BriefFields":
        if isinstance(self.budget, (int, float)) and self.budget < 0:
            raise ValueError("budget must be >= 0")
        return self


class ParseBriefRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str | None = Field(default=None, max_length=20_000)
    fields: BriefFields | None = None

    @model_validator(mode="after")
    def _one_input(self) -> "ParseBriefRequest":
        if not (self.text and self.text.strip()) and self.fields is None:
            raise ValueError("provide `text` or `fields`")
        return self


class ApplicationScoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: UUID | None = None
    creator_id: UUID | None = None
    brief_id: UUID | None = None

    @model_validator(mode="after")
    def _ids(self) -> "ApplicationScoreRequest":
        if self.application_id is None and (self.creator_id is None or self.brief_id is None):
            raise ValueError("provide `application_id`, or both `creator_id` and `brief_id`")
        return self


class ApplicationBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_ids: list[UUID] | None = Field(default=None, max_length=1000)
    brief_id: UUID | None = None

    @model_validator(mode="after")
    def _ids(self) -> "ApplicationBatchRequest":
        if not self.application_ids and self.brief_id is None:
            raise ValueError("provide `application_ids` or `brief_id`")
        return self


class EmbeddingBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["creator", "brief"]
    ids: list[UUID] | None = Field(default=None, max_length=10_000, description="omit to refresh all")
    force: bool = False


class ScoreBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    creator_ids: list[UUID] | None = Field(default=None, max_length=10_000, description="omit to recompute all")
