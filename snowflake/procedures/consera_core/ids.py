"""Stable identifiers and fingerprints for retry-safe Snowflake writes."""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from collections.abc import Mapping, Sequence
from typing import Any

_WHITESPACE = re.compile(r"\s+")
_NAMESPACE = uuid.UUID("f03bd056-7ca7-4619-8751-67066985f804")


def canonical_json(value: Mapping[str, Any] | Sequence[Any]) -> str:
    """Serialize a JSON-compatible value in one stable representation."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def sha256_text(value: str) -> str:
    """Return a lowercase SHA-256 digest."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def stable_uuid(kind: str, *parts: str) -> str:
    """Generate a deterministic UUID for idempotent business entities."""
    normalized = "|".join([normalize_key(kind), *(normalize_key(part) for part in parts)])
    return str(uuid.uuid5(_NAMESPACE, normalized))


def normalize_key(value: str) -> str:
    """Normalize a human or source identifier without changing its meaning."""
    return _WHITESPACE.sub(" ", value.strip().lower())


def alert_fingerprint(
    project_id: str,
    topic: str,
    impact_type: str,
    affected_capability: str,
    policy_version: str = "alert-policy-v1",
) -> str:
    """Create the policy-defined alert deduplication fingerprint."""
    material = "|".join(
        normalize_key(value)
        for value in (
            project_id,
            topic,
            impact_type,
            affected_capability,
            policy_version,
        )
    )
    return sha256_text(material)
