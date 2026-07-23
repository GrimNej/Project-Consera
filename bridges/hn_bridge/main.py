"""Command-line entry point for scheduled Consera signal ingestion."""

from __future__ import annotations

import argparse
import json
import os
import time
from typing import Literal, cast

from hn_bridge.batch import build_batch
from hn_bridge.client import HackerNewsClient
from hn_bridge.upload import SnowflakeSettings, upload_batch


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest bounded Hacker News signals")
    parser.add_argument("--mode", choices=("scheduled", "manual"), default="scheduled")
    parser.add_argument("--max-stories", type=int, choices=range(1, 31), default=30)
    parser.add_argument("--max-comments", type=int, choices=range(0, 101), default=100)
    return parser.parse_args()


def main() -> int:
    """Fetch, canonicalize, and upload one bounded batch."""
    args = _arguments()
    started = time.monotonic()
    with HackerNewsClient() as client:
        stories, comments = client.collect(args.max_stories, args.max_comments)
    mode = cast(Literal["scheduled", "manual", "replay"], args.mode)
    batch = build_batch(
        stories=stories,
        comments=comments,
        enrichments=[],
        fetch_mode=mode,
        github_run_id=os.environ.get("GITHUB_RUN_ID"),
    )
    result = upload_batch(batch, SnowflakeSettings.from_environment())
    print(
        json.dumps(
            {
                "batchId": batch.batch_id,
                "comments": len(comments),
                "durationMs": round((time.monotonic() - started) * 1000),
                "result": result,
                "stories": len(stories),
            },
            separators=(",", ":"),
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
