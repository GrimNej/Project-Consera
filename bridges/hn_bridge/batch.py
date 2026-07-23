"""Canonical batch construction for scheduled and replay ingestion."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from consera_core.ids import canonical_json, sha256_text

from hn_bridge.models import ArticleEnrichment, HnItem, IngestBatch

BRIDGE_VERSION = "hn-bridge-v1"


def build_batch(
    *,
    stories: list[HnItem],
    comments: list[HnItem],
    enrichments: list[ArticleEnrichment],
    fetch_mode: Literal["scheduled", "manual", "replay"],
    fetched_at: datetime | None = None,
    github_run_id: str | None = None,
) -> IngestBatch:
    """Create a canonical, hash-bound ingestion batch."""
    observed_at = (fetched_at or datetime.now(UTC)).astimezone(UTC)
    body = {
        "bridge_version": BRIDGE_VERSION,
        "comments": [item.model_dump(mode="json") for item in comments],
        "enrichments": [item.model_dump(mode="json") for item in enrichments],
        "fetch_mode": fetch_mode,
        "fetched_at": observed_at.isoformat().replace("+00:00", "Z"),
        "github_run_id": github_run_id,
        "schema_version": 1,
        "source": "hacker-news",
        "stories": [item.model_dump(mode="json") for item in stories],
    }
    payload_sha256 = sha256_text(canonical_json(body))
    batch_id = sha256_text(f"consera-hn-batch-v1|{payload_sha256}")
    return IngestBatch(
        schema_version=1,
        batch_id=batch_id,
        source="hacker-news",
        fetch_mode=fetch_mode,
        bridge_version=BRIDGE_VERSION,
        fetched_at=observed_at,
        github_run_id=github_run_id,
        stories=stories,
        comments=comments,
        enrichments=enrichments,
        payload_sha256=payload_sha256,
    )
