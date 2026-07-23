"""Hardened client for the official Hacker News Firebase API."""

from __future__ import annotations

import json
import random
import time
from collections.abc import Callable, Sequence
from typing import Any

import httpx
from pydantic import TypeAdapter, ValidationError

from hn_bridge.models import HnItem

HN_ORIGIN = "https://hacker-news.firebaseio.com"
MAX_LIST_BYTES = 2_000_000
MAX_ITEM_BYTES = 256_000
RETRYABLE_STATUS = {429, 502, 503, 504}

_ID_LIST = TypeAdapter(list[int])


class SourceError(RuntimeError):
    """A classified bridge-source error without raw source content."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class HackerNewsClient:
    """Bounded retriable client for fixed official API paths."""

    def __init__(
        self,
        *,
        transport: httpx.BaseTransport | None = None,
        sleeper: Callable[[float], None] = time.sleep,
        randomizer: Callable[[], float] = random.random,
    ) -> None:
        self._client = httpx.Client(
            base_url=HN_ORIGIN,
            follow_redirects=False,
            headers={
                "Accept": "application/json",
                "User-Agent": "Consera-Signal-Research/1.0",
            },
            timeout=httpx.Timeout(8.0, connect=3.0),
            transport=transport,
        )
        self._sleeper = sleeper
        self._randomizer = randomizer

    def close(self) -> None:
        """Release the connection pool."""
        self._client.close()

    def __enter__(self) -> HackerNewsClient:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def _bounded_json(self, path: str, limit: int) -> Any:
        last_code = "HN_FETCH_FAILED"
        for attempt in range(3):
            try:
                with self._client.stream("GET", path) as response:
                    if response.status_code in RETRYABLE_STATUS:
                        last_code = f"HN_RETRYABLE_{response.status_code}"
                        raise httpx.HTTPStatusError(
                            "retryable",
                            request=response.request,
                            response=response,
                        )
                    if response.status_code != 200:
                        raise SourceError(f"HN_HTTP_{response.status_code}")
                    content_type = response.headers.get("content-type", "").casefold()
                    if not content_type.startswith("application/json"):
                        raise SourceError("HN_CONTENT_TYPE_INVALID")
                    chunks: list[bytes] = []
                    total = 0
                    for chunk in response.iter_bytes():
                        total += len(chunk)
                        if total > limit:
                            raise SourceError("HN_RESPONSE_TOO_LARGE")
                        chunks.append(chunk)
                try:
                    return json.loads(b"".join(chunks).decode("utf-8", errors="strict"))
                except (UnicodeDecodeError, json.JSONDecodeError) as error:
                    raise SourceError("HN_JSON_INVALID") from error
            except SourceError:
                raise
            except (
                httpx.TimeoutException,
                httpx.NetworkError,
                httpx.HTTPStatusError,
            ) as error:
                if attempt == 2:
                    raise SourceError(last_code) from error
                self._sleeper(self._randomizer() * (0.4 * (2**attempt)))
        raise SourceError(last_code)

    def story_ids(self) -> list[int]:
        """Merge new, top, best, and Show HN feeds in stable priority order."""
        merged: list[int] = []
        seen: set[int] = set()
        for feed in ("newstories", "topstories", "beststories", "showstories"):
            try:
                values = _ID_LIST.validate_python(
                    self._bounded_json(f"/v0/{feed}.json", MAX_LIST_BYTES)
                )
            except ValidationError as error:
                raise SourceError("HN_ID_LIST_INVALID") from error
            for item_id in values:
                if item_id > 0 and item_id not in seen:
                    merged.append(item_id)
                    seen.add(item_id)
        return merged

    def item(self, item_id: int) -> HnItem | None:
        """Fetch and validate one positive item ID."""
        if item_id <= 0:
            raise ValueError("item_id must be positive")
        payload = self._bounded_json(f"/v0/item/{item_id}.json", MAX_ITEM_BYTES)
        if payload is None:
            return None
        try:
            return HnItem.model_validate(payload)
        except ValidationError as error:
            raise SourceError("HN_ITEM_SCHEMA_INVALID") from error

    def collect(self, max_stories: int, max_comments: int) -> tuple[list[HnItem], list[HnItem]]:
        """Fetch a bounded story set and a bounded, stable comment sample."""
        if not 0 <= max_stories <= 30 or not 0 <= max_comments <= 100:
            raise ValueError("bridge limits exceeded")
        stories: list[HnItem] = []
        for item_id in self.story_ids():
            item = self.item(item_id)
            if item and item.type in ("story", "job", "poll"):
                stories.append(item)
            if len(stories) >= max_stories:
                break

        comment_ids = _round_robin([story.kids for story in stories], max_comments)
        comments: list[HnItem] = []
        for comment_id in comment_ids:
            item = self.item(comment_id)
            if item and item.type == "comment":
                comments.append(item)
        return stories, comments


def _round_robin(groups: Sequence[Sequence[int]], limit: int) -> list[int]:
    """Prevent one large discussion from consuming the comment budget."""
    output: list[int] = []
    seen: set[int] = set()
    offset = 0
    while len(output) < limit:
        added = False
        for group in groups:
            if offset < len(group):
                value = group[offset]
                if value > 0 and value not in seen:
                    output.append(value)
                    seen.add(value)
                    added = True
                    if len(output) >= limit:
                        break
        if not added:
            break
        offset += 1
    return output
