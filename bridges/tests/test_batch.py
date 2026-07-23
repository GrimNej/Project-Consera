from __future__ import annotations

from datetime import UTC, datetime

from hn_bridge.batch import build_batch
from hn_bridge.models import HnItem


def story(item_id: int = 42) -> HnItem:
    return HnItem(
        id=item_id,
        type="story",
        by="builder",
        time=1_700_000_000,
        title="A new developer platform",
        url="https://example.com/platform",
        kids=[100],
        descendants=1,
        score=80,
    )


def test_batch_hash_is_replay_stable() -> None:
    observed = datetime(2026, 7, 23, 5, 0, tzinfo=UTC)
    first = build_batch(
        stories=[story()],
        comments=[],
        enrichments=[],
        fetch_mode="replay",
        fetched_at=observed,
    )
    second = build_batch(
        stories=[story()],
        comments=[],
        enrichments=[],
        fetch_mode="replay",
        fetched_at=observed,
    )
    assert first.batch_id == second.batch_id
    assert first.payload_sha256 == second.payload_sha256


def test_observation_time_changes_batch_identity() -> None:
    first = build_batch(
        stories=[story()],
        comments=[],
        enrichments=[],
        fetch_mode="replay",
        fetched_at=datetime(2026, 7, 23, 5, 0, tzinfo=UTC),
    )
    second = build_batch(
        stories=[story()],
        comments=[],
        enrichments=[],
        fetch_mode="replay",
        fetched_at=datetime(2026, 7, 23, 5, 5, tzinfo=UTC),
    )
    assert first.batch_id != second.batch_id
