"""Command-line entry point for scheduled Consera signal ingestion."""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Literal, cast

from hn_bridge.batch import build_batch
from hn_bridge.client import HackerNewsClient
from hn_bridge.upload import BudgetPausedError, SnowflakeSettings, upload_batch


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
    try:
        result = upload_batch(batch, SnowflakeSettings.from_environment())
    except BudgetPausedError:
        outcome = {
            "batchId": batch.batch_id,
            "comments": len(comments),
            "durationMs": round((time.monotonic() - started) * 1000),
            "result": {
                "reason": "WEEKLY_RESOURCE_MONITOR",
                "state": "PAUSED_BUDGET",
            },
            "stories": len(stories),
        }
        print(json.dumps(outcome, separators=(",", ":"), sort_keys=True))
        summary_path = os.environ.get("GITHUB_STEP_SUMMARY", "").strip()
        if summary_path:
            Path(summary_path).write_text(
                "## Consera ingestion\n\n"
                "The scheduled run stopped at the intentional weekly Snowflake budget ceiling. "
                "No source batch was written and the next weekly window recovers automatically.\n",
                encoding="utf-8",
            )
        return 0 if args.mode == "scheduled" else 3
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
