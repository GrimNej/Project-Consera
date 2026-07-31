"""Export one public, last-known-good Consera workspace snapshot from Snowflake."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import snowflake.connector
from snowflake.connector import SnowflakeConnection

from scripts.build_snowpark_bundle import REPO_ROOT

DEFAULT_OUTPUT = REPO_ROOT / "apps" / "api" / "src" / "snapshot" / "workspace.json"
MAX_SNAPSHOT_BYTES = 1_000_000


def _variant(value: object) -> Any:
    if isinstance(value, str):
        return json.loads(value)
    return value


def _query_variants(
    connection: SnowflakeConnection,
    statement: str,
) -> list[Any]:
    cursor = connection.cursor()
    try:
        cursor.execute(statement)
        return [_variant(row[0]) for row in cursor.fetchall()]
    finally:
        cursor.close()


def export_snapshot(connection: SnowflakeConnection, output: Path) -> dict[str, int]:
    dashboard_rows = _query_variants(
        connection,
        "SELECT DASHBOARD FROM CONSERA.APP_API.DASHBOARD_V LIMIT 1",
    )
    if len(dashboard_rows) != 1 or not isinstance(dashboard_rows[0], dict):
        raise RuntimeError("WORKSPACE_DASHBOARD_INVALID")
    signals = _query_variants(
        connection,
        """
        SELECT SIGNAL
        FROM CONSERA.APP_API.SIGNAL_V
        ORDER BY DISCOVERED_AT DESC
        LIMIT 100
        """,
    )
    verdicts = _query_variants(
        connection,
        """
        SELECT VERDICT
        FROM CONSERA.APP_API.VERDICT_V
        ORDER BY PUBLISHED_AT DESC
        LIMIT 100
        """,
    )
    alerts = _query_variants(
        connection,
        """
        SELECT ALERT
        FROM CONSERA.APP_API.ALERT_V
        ORDER BY CREATED_AT DESC
        LIMIT 100
        """,
    )
    payload = {
        "capturedAt": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "ready": True,
        "workspace": {
            "alerts": alerts,
            "dashboard": dashboard_rows[0],
            "signals": signals,
            "verdicts": verdicts,
        },
    }
    serialized = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if len(serialized.encode("utf-8")) > MAX_SNAPSHOT_BYTES:
        raise RuntimeError("WORKSPACE_SNAPSHOT_TOO_LARGE")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    temporary.write_text(serialized, encoding="utf-8")
    temporary.replace(output)
    return {
        "alerts": len(alerts),
        "projects": len(dashboard_rows[0].get("projects", [])),
        "signals": len(signals),
        "verdicts": len(verdicts),
    }


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export the public Consera workspace snapshot")
    parser.add_argument("--connection", required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = _arguments()
    connection = snowflake.connector.connect(connection_name=args.connection)
    try:
        counts = export_snapshot(connection, args.output)
    finally:
        connection.close()
    print(json.dumps(counts, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
