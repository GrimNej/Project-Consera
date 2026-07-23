"""Strict public-source contracts for the Hacker News bridge."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    """Forbid source drift from becoming an implicit schema expansion."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class HnItem(StrictModel):
    """Bounded subset of one official Hacker News Firebase item."""

    id: int = Field(gt=0)
    type: Literal["story", "comment", "job", "poll", "pollopt"]
    by: str | None = Field(default=None, max_length=255)
    time: int = Field(ge=0)
    title: str | None = Field(default=None, max_length=1000)
    url: str | None = Field(default=None, max_length=4000)
    text: str | None = Field(default=None, max_length=20000)
    parent: int | None = Field(default=None, gt=0)
    poll: int | None = Field(default=None, gt=0)
    kids: list[int] = Field(default_factory=list, max_length=1000)
    parts: list[int] = Field(default_factory=list, max_length=1000)
    descendants: int | None = Field(default=None, ge=0)
    score: int | None = Field(default=None, ge=0)
    deleted: bool = False
    dead: bool = False

    @field_validator("url")
    @classmethod
    def public_web_url(cls, value: str | None) -> str | None:
        """Keep only bounded public web schemes."""
        if value is not None and not value.casefold().startswith(("https://", "http://")):
            raise ValueError("unsupported URL scheme")
        return value


class ArticleEnrichment(BaseModel):
    """Optional, security-bounded article context."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    story_id: int = Field(gt=0)
    canonical_url: str = Field(min_length=1, max_length=4000)
    final_url: str = Field(min_length=1, max_length=4000)
    title: str | None = Field(default=None, max_length=1000)
    description: str | None = Field(default=None, max_length=3000)
    sanitized_text: str | None = Field(default=None, max_length=12000)
    fetched_at: datetime
    status: Literal[
        "success",
        "robots_disallowed",
        "unsupported_content",
        "timeout",
        "too_large",
        "blocked_address",
        "fetch_error",
    ]
    content_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class IngestBatch(BaseModel):
    """Canonical replay-safe bridge envelope."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1]
    batch_id: str = Field(pattern=r"^[a-f0-9]{64}$")
    source: Literal["hacker-news"]
    fetch_mode: Literal["scheduled", "manual", "replay"]
    bridge_version: str = Field(min_length=1, max_length=64)
    fetched_at: datetime
    github_run_id: str | None = Field(default=None, max_length=100)
    stories: list[HnItem] = Field(max_length=30)
    comments: list[HnItem] = Field(max_length=100)
    enrichments: list[ArticleEnrichment] = Field(max_length=3)
    payload_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
