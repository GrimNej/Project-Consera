from __future__ import annotations

import json

import httpx
import pytest
from hn_bridge.client import HackerNewsClient, SourceError, _round_robin


def response(payload: object, content_type: str = "application/json") -> httpx.Response:
    return httpx.Response(
        200,
        content=json.dumps(payload).encode(),
        headers={"content-type": content_type},
    )


def test_collect_is_bounded_and_round_robin() -> None:
    feeds = {
        "/v0/newstories.json": [1, 2],
        "/v0/topstories.json": [2, 1],
        "/v0/beststories.json": [],
        "/v0/showstories.json": [],
        "/v0/item/1.json": {
            "id": 1,
            "type": "story",
            "time": 100,
            "title": "One",
            "kids": [10, 11],
        },
        "/v0/item/2.json": {
            "id": 2,
            "type": "story",
            "time": 101,
            "title": "Two",
            "kids": [20, 21],
        },
        "/v0/item/10.json": {"id": 10, "type": "comment", "time": 102, "parent": 1},
        "/v0/item/20.json": {"id": 20, "type": "comment", "time": 102, "parent": 2},
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return response(feeds[request.url.path])

    with HackerNewsClient(transport=httpx.MockTransport(handler)) as client:
        stories, comments = client.collect(2, 2)
    assert [item.id for item in stories] == [1, 2]
    assert [item.id for item in comments] == [10, 20]


def test_non_json_is_rejected_before_parsing() -> None:
    transport = httpx.MockTransport(
        lambda _request: response({"not": "used"}, content_type="text/html")
    )
    with (
        HackerNewsClient(transport=transport) as client,
        pytest.raises(SourceError, match="HN_CONTENT_TYPE_INVALID"),
    ):
        client.story_ids()


def test_round_robin_deduplicates() -> None:
    assert _round_robin([[1, 2], [1, 3]], 4) == [1, 2, 3]


def test_retryable_source_failure_recovers_with_bounded_backoff() -> None:
    attempts = 0
    waits: list[float] = []

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            return httpx.Response(503, headers={"content-type": "application/json"})
        return response([])

    with HackerNewsClient(
        transport=httpx.MockTransport(handler),
        sleeper=waits.append,
        randomizer=lambda: 0.5,
    ) as client:
        assert client._bounded_json("/v0/newstories.json", 1_000) == []

    assert attempts == 3
    assert waits == [0.2, 0.4]


def test_retryable_source_failure_stops_after_three_attempts() -> None:
    attempts = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        raise httpx.ConnectError("sanitized")

    with (
        HackerNewsClient(
            transport=httpx.MockTransport(handler),
            sleeper=lambda _delay: None,
            randomizer=lambda: 0.0,
        ) as client,
        pytest.raises(SourceError, match="HN_FETCH_FAILED"),
    ):
        client._bounded_json("/v0/newstories.json", 1_000)

    assert attempts == 3
