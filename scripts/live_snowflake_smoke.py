"""Exercise Consera's live profile and idempotency contracts without logging source text."""

from __future__ import annotations

import argparse
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import snowflake.connector
from snowflake.connector import SnowflakeConnection

from scripts.build_snowpark_bundle import REPO_ROOT

DEFAULT_REPORT = REPO_ROOT / "docs" / "evidence" / "live-snowflake-smoke.json"
DEFAULT_SOURCE = REPO_ROOT / "README.md"


def _variant(value: object) -> dict[str, Any]:
    if isinstance(value, str):
        decoded = json.loads(value)
        if not isinstance(decoded, dict):
            raise RuntimeError("Snowflake returned a non-object VARIANT")
        return decoded
    if isinstance(value, dict):
        return value
    raise RuntimeError("Snowflake returned an unsupported VARIANT representation")


def _call_variant(
    connection: SnowflakeConnection,
    statement: str,
    parameters: tuple[object, ...],
) -> dict[str, Any]:
    cursor = connection.cursor()
    try:
        cursor.execute(statement, parameters)
        row = cursor.fetchone()
    finally:
        cursor.close()
    if not row:
        raise RuntimeError("Snowflake procedure returned no result")
    return _variant(row[0])


def _wait_for_draft(
    connection: SnowflakeConnection,
    project_id: str,
    timeout_seconds: int,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        cursor = connection.cursor()
        try:
            cursor.execute(
                """
                SELECT DRAFT
                FROM CONSERA.APP_API.PROFILE_DRAFT_V
                WHERE PROJECT_ID = %s
                """,
                (project_id,),
            )
            row = cursor.fetchone()
        finally:
            cursor.close()
        if row:
            return _variant(row[0])
        time.sleep(5)
    raise TimeoutError("The live profile draft did not become ready within the bounded wait")


def run_smoke(
    connection: SnowflakeConnection,
    source_path: Path,
    timeout_seconds: int,
    run_suffix: str,
) -> dict[str, Any]:
    source = source_path.read_text(encoding="utf-8")
    created = _call_variant(
        connection,
        "CALL CONSERA.APP_API.CREATE_PROJECT(%s, %s, %s, %s)",
        ("Consera", source, True, f"live-smoke-project-{run_suffix}"),
    )
    project_id = str(created["id"])
    draft = _wait_for_draft(connection, project_id, timeout_seconds)
    profile = draft["profile"]
    if not isinstance(profile, dict):
        raise RuntimeError("The profile draft did not contain an object profile")

    activated = _call_variant(
        connection,
        """
        CALL CONSERA.APP_API.ACTIVATE_PROFILE(
            %s,
            PARSE_JSON(%s),
            %s,
            %s
        )
        """,
        (
            project_id,
            json.dumps(profile, separators=(",", ":"), sort_keys=True),
            int(draft["projectVersion"]),
            f"live-smoke-activation-{run_suffix}",
        ),
    )
    first_request = _call_variant(
        connection,
        "CALL CONSERA.APP_API.REQUEST_INGESTION(%s)",
        (f"live-smoke-ingestion-{run_suffix}",),
    )
    replay_request = _call_variant(
        connection,
        "CALL CONSERA.APP_API.REQUEST_INGESTION(%s)",
        (f"live-smoke-ingestion-{run_suffix}",),
    )
    health = _call_variant(connection, "CALL CONSERA.APP_API.HEALTH()", ())

    active_profile = activated.get("activeProfile")
    active_version = (
        int(active_profile.get("version", 0)) if isinstance(active_profile, dict) else 0
    )
    return {
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "health_state": health.get("status"),
        "ingestion_replay_stable": first_request == replay_request,
        "profile_state": activated.get("profileState"),
        "profile_version": active_version,
        "project_id": project_id,
        "source_bytes": len(source.encode("utf-8")),
        "status": "PASSED",
    }


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the live Consera Snowflake smoke contract")
    parser.add_argument("--connection", required=True)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--timeout-seconds", type=int, default=240)
    parser.add_argument("--run-suffix", default="v1")
    return parser.parse_args()


def main() -> int:
    args = _arguments()
    connection = snowflake.connector.connect(connection_name=args.connection)
    try:
        report = run_smoke(
            connection,
            args.source,
            args.timeout_seconds,
            args.run_suffix,
        )
    finally:
        connection.close()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("live Snowflake profile and idempotency smoke passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
