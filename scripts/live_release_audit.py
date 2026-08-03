"""Run one sanitized, bounded audit of the live Consera Snowflake release."""

from __future__ import annotations

import argparse
import json
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import snowflake.connector
from snowflake.connector import SnowflakeConnection

from scripts.build_snowpark_bundle import REPO_ROOT

DEFAULT_OUTPUT = REPO_ROOT / "docs" / "evidence" / "release-reliability-verification.json"
EXPECTED_MONITORS = {
    "CONSERA_APP_WH": "CONSERA_APP_MONITOR",
    "CONSERA_INGEST_WH": "CONSERA_INGEST_MONITOR",
    "CONSERA_PIPELINE_WH": "CONSERA_PIPELINE_MONITOR",
}
EXPECTED_MONITOR_QUOTAS = {
    "CONSERA_APP_MONITOR": 1.0,
    "CONSERA_INGEST_MONITOR": 1.0,
    "CONSERA_PIPELINE_MONITOR": 2.0,
}
EXPECTED_TASKS = {
    "PROCESS_ALERT_TASK",
    "PROCESS_EVALUATION_TASK",
    "PROCESS_LANDING_TASK",
    "PROCESS_PROFILE_TASK",
}


def _rows(cursor: Any) -> list[dict[str, Any]]:
    columns = [str(column[0]).lower() for column in cursor.description]
    return [dict(zip(columns, row, strict=True)) for row in cursor.fetchall()]


def _string(value: object) -> str:
    return "" if value is None else str(value)


def _boolean(value: object) -> bool:
    return _string(value).casefold() in {"true", "yes", "1"}


def _variant(value: object) -> dict[str, Any]:
    decoded = json.loads(value) if isinstance(value, str) else value
    if not isinstance(decoded, dict):
        raise RuntimeError("LIVE_AUDIT_VARIANT_INVALID")
    return decoded


def validate_release_state(state: Mapping[str, Any]) -> list[str]:
    """Return stable failure codes without exposing live data or identifiers."""
    findings: list[str] = []
    warehouses = {
        _string(row.get("name")): row
        for row in state.get("warehouses", [])
        if isinstance(row, Mapping)
    }
    if set(warehouses) != set(EXPECTED_MONITORS):
        findings.append("WAREHOUSE_SET_INVALID")
    for warehouse_name, monitor_name in EXPECTED_MONITORS.items():
        warehouse = warehouses.get(warehouse_name, {})
        if _string(warehouse.get("size")).replace("-", "").casefold() != "xsmall":
            findings.append(f"{warehouse_name}_SIZE_INVALID")
        if int(warehouse.get("auto_suspend") or 0) != 60:
            findings.append(f"{warehouse_name}_AUTO_SUSPEND_INVALID")
        if _boolean(warehouse.get("enable_query_acceleration")):
            findings.append(f"{warehouse_name}_QUERY_ACCELERATION_ENABLED")
        if _string(warehouse.get("resource_monitor")).upper() != monitor_name:
            findings.append(f"{warehouse_name}_MONITOR_INVALID")

    monitors = {
        _string(row.get("name")): row
        for row in state.get("monitors", [])
        if isinstance(row, Mapping)
    }
    expected_monitor_names = set(EXPECTED_MONITORS.values())
    if not expected_monitor_names.issubset(monitors):
        findings.append("RESOURCE_MONITOR_SET_INVALID")
    for monitor_name in expected_monitor_names:
        monitor = monitors.get(monitor_name, {})
        if float(monitor.get("credit_quota") or 0) != EXPECTED_MONITOR_QUOTAS[monitor_name]:
            findings.append(f"{monitor_name}_QUOTA_INVALID")
        if _string(monitor.get("frequency")).upper() != "WEEKLY":
            findings.append(f"{monitor_name}_FREQUENCY_INVALID")

    tasks = {
        _string(row.get("name")): row for row in state.get("tasks", []) if isinstance(row, Mapping)
    }
    if set(tasks) != EXPECTED_TASKS:
        findings.append("TASK_SET_INVALID")
    findings.extend(
        f"{task_name}_NOT_STARTED"
        for task_name in EXPECTED_TASKS
        if _string(tasks.get(task_name, {}).get("state")).casefold() != "started"
    )
    landing = tasks.get("PROCESS_LANDING_TASK", {})
    evaluation = tasks.get("PROCESS_EVALUATION_TASK", {})
    alert = tasks.get("PROCESS_ALERT_TASK", {})
    profile = tasks.get("PROCESS_PROFILE_TASK", {})
    if "INGEST_BATCH_STREAM" not in _string(landing.get("condition")).upper():
        findings.append("LANDING_TRIGGER_INVALID")
    if "PROCESS_LANDING_TASK" not in _string(evaluation.get("predecessors")).upper():
        findings.append("EVALUATION_PREDECESSOR_INVALID")
    if "PROCESS_EVALUATION_TASK" not in _string(alert.get("predecessors")).upper():
        findings.append("ALERT_PREDECESSOR_INVALID")
    if _string(evaluation.get("condition")) or _string(alert.get("condition")):
        findings.append("STATE_TABLE_TRIGGER_REMAINS")
    if _string(profile.get("overlap_policy")).upper() != "NO_OVERLAP":
        findings.append("PROFILE_TASK_OVERLAP_POLICY_INVALID")

    streams = {
        _string(row.get("name")): row
        for row in state.get("streams", [])
        if isinstance(row, Mapping)
    }
    findings.extend(
        f"{stream_name}_NOT_APPEND_ONLY"
        for stream_name in (
            "ALERT_DECISION_STREAM",
            "EVALUATION_JOB_STREAM",
            "INGEST_BATCH_STREAM",
            "PROJECT_DOCUMENT_STREAM",
        )
        if _string(streams.get(stream_name, {}).get("mode")).upper() != "APPEND_ONLY"
    )

    metrics = state.get("metrics", {})
    if not isinstance(metrics, Mapping):
        return [*findings, "LIVE_METRICS_INVALID"]
    if int(metrics.get("active_project_count") or 0) != 1:
        findings.append("ACTIVE_PROJECT_COUNT_INVALID")
    if int(metrics.get("observatory_count") or 0) != 1:
        findings.append("AI_OBSERVATORY_NOT_ACTIVE")
    if int(metrics.get("v005_count") or 0) != 1:
        findings.append("V005_MIGRATION_NOT_RECORDED")
    if int(metrics.get("v006_count") or 0) != 1:
        findings.append("V006_MIGRATION_NOT_RECORDED")
    if int(metrics.get("v007_count") or 0) != 1:
        findings.append("V007_MIGRATION_NOT_RECORDED")
    if int(metrics.get("v008_count") or 0) != 1:
        findings.append("V008_MIGRATION_NOT_RECORDED")
    if int(metrics.get("v009_count") or 0) != 1:
        findings.append("V009_MIGRATION_NOT_RECORDED")
    if int(metrics.get("v010_count") or 0) != 1:
        findings.append("V010_MIGRATION_NOT_RECORDED")
    if int(metrics.get("queue_failure_count") or 0) != 0:
        findings.append("QUEUE_FAILURES_PRESENT")
    if int(metrics.get("terminal_delivery_failure_count") or 0) != 0:
        findings.append("DELIVERY_FAILURES_PRESENT")

    task_runs = state.get("task_runs", {})
    if not isinstance(task_runs, Mapping):
        findings.append("TASK_HISTORY_INVALID")
    else:
        landing_runs = int(task_runs.get("PROCESS_LANDING_TASK") or 0)
        evaluation_runs = int(task_runs.get("PROCESS_EVALUATION_TASK") or 0)
        alert_runs = int(task_runs.get("PROCESS_ALERT_TASK") or 0)
        if landing_runs > 2 or evaluation_runs > landing_runs or alert_runs > evaluation_runs:
            findings.append("TASK_GRAPH_MULTIPLICITY_INVALID")
        if int(task_runs.get("FAILED") or 0) != 0:
            findings.append("RECENT_TASK_FAILURE_PRESENT")
    return findings


def collect_release_state(connection: SnowflakeConnection) -> dict[str, Any]:
    """Collect only bounded operational metadata and aggregate counts."""
    cursor = connection.cursor()
    try:
        cursor.execute("USE ROLE CONSERA_ADMIN_ROLE")
        cursor.execute("SHOW WAREHOUSES LIKE 'CONSERA_%'")
        warehouses = _rows(cursor)
        cursor.execute("SHOW RESOURCE MONITORS LIKE 'CONSERA_%_MONITOR'")
        monitors = [
            row
            for row in _rows(cursor)
            if _string(row.get("name")) in set(EXPECTED_MONITORS.values())
        ]
        cursor.execute("SHOW TASKS IN DATABASE CONSERA")
        tasks = _rows(cursor)
        cursor.execute("SHOW STREAMS IN DATABASE CONSERA")
        streams = _rows(cursor)

        cursor.execute("USE WAREHOUSE CONSERA_PIPELINE_WH")
        cursor.execute(
            """
            SELECT
                COUNT_IF(ARCHIVED_AT IS NULL) AS ACTIVE_PROJECT_COUNT,
                COUNT_IF(
                    ARCHIVED_AT IS NULL
                    AND DISPLAY_NAME = 'AI Change Observatory'
                ) AS OBSERVATORY_COUNT,
                (
                    SELECT COUNT(*)
                    FROM CONSERA.OPS.SCHEMA_MIGRATIONS
                    WHERE VERSION = 'V005'
                        AND STATE = 'APPLIED'
                ) AS V005_COUNT,
                (
                    SELECT COUNT(*)
                    FROM CONSERA.OPS.SCHEMA_MIGRATIONS
                    WHERE VERSION = 'V006'
                        AND STATE = 'APPLIED'
                ) AS V006_COUNT,
                (
                    SELECT COUNT(*)
                    FROM CONSERA.OPS.SCHEMA_MIGRATIONS
                    WHERE VERSION = 'V007'
                        AND STATE = 'APPLIED'
                ) AS V007_COUNT,
                (
                    SELECT COUNT(*)
                    FROM CONSERA.OPS.SCHEMA_MIGRATIONS
                    WHERE VERSION = 'V008'
                        AND STATE = 'APPLIED'
                ) AS V008_COUNT,
                (
                    SELECT COUNT(*)
                    FROM CONSERA.OPS.SCHEMA_MIGRATIONS
                    WHERE VERSION = 'V009'
                        AND STATE = 'APPLIED'
                ) AS V009_COUNT,
                (
                    SELECT COUNT(*)
                    FROM CONSERA.OPS.SCHEMA_MIGRATIONS
                    WHERE VERSION = 'V010'
                        AND STATE = 'APPLIED'
                ) AS V010_COUNT,
                (
                    SELECT COUNT(*)
                    FROM CONSERA.OPS.BATCH_WORK_QUEUE
                    WHERE STATE IN ('FAILED_RETRYABLE', 'FAILED_TERMINAL')
                )
                + (
                    SELECT COUNT(*)
                    FROM CONSERA.OPS.PROFILE_WORK_QUEUE AS profile_job
                    INNER JOIN CONSERA.CORE.PROJECTS AS project
                        ON profile_job.PROJECT_ID = project.PROJECT_ID
                    WHERE profile_job.STATE IN ('FAILED_RETRYABLE', 'FAILED_TERMINAL')
                        AND project.ARCHIVED_AT IS NULL
                )
                + (
                    SELECT COUNT(*)
                    FROM CONSERA.OPS.EVALUATION_JOBS AS evaluation_job
                    INNER JOIN CONSERA.CORE.PROJECTS AS project
                        ON evaluation_job.PROJECT_ID = project.PROJECT_ID
                    WHERE evaluation_job.STATE = 'FAILED_TERMINAL'
                        AND evaluation_job.LAST_ERROR_CODE <> 'JOB_INPUT_STALE'
                        AND project.ARCHIVED_AT IS NULL
                        AND NOT EXISTS (
                            SELECT 1
                            FROM CONSERA.OPS.EVALUATION_JOBS AS recovered_job
                            WHERE recovered_job.PROJECT_ID = evaluation_job.PROJECT_ID
                                AND recovered_job.STATE = 'SUCCEEDED'
                                AND recovered_job.UPDATED_AT > evaluation_job.UPDATED_AT
                        )
                ) AS QUEUE_FAILURE_COUNT,
                (
                    SELECT COUNT(*)
                    FROM CONSERA.ALERTING.NOTIFICATION_DELIVERIES AS delivery
                    INNER JOIN CONSERA.ALERTING.ALERT_DECISIONS AS alert
                        ON delivery.ALERT_ID = alert.ALERT_ID
                    INNER JOIN CONSERA.CORE.PROJECTS AS project
                        ON alert.PROJECT_ID = project.PROJECT_ID
                    WHERE delivery.STATE IN ('FAILED_TERMINAL', 'DELIVERY_UNKNOWN')
                        AND project.ARCHIVED_AT IS NULL
                ) AS TERMINAL_DELIVERY_FAILURE_COUNT
            FROM CONSERA.CORE.PROJECTS
            """
        )
        metric_row = _rows(cursor)[0]
        cursor.execute(
            """
            SELECT NAME, STATE
            FROM TABLE(
                CONSERA.INFORMATION_SCHEMA.TASK_HISTORY(
                    SCHEDULED_TIME_RANGE_START =>
                        DATEADD('hour', -2, CURRENT_TIMESTAMP()),
                    RESULT_LIMIT => 100
                )
            )
            WHERE NAME IN (
                'PROCESS_LANDING_TASK',
                'PROCESS_EVALUATION_TASK',
                'PROCESS_ALERT_TASK'
            )
                AND STATE <> 'SKIPPED'
            """
        )
        task_history = _rows(cursor)
        cursor.execute("SELECT DASHBOARD FROM CONSERA.APP_API.DASHBOARD_V LIMIT 1")
        dashboard_row = cursor.fetchone()
        dashboard = _variant(dashboard_row[0]) if dashboard_row else {}
    finally:
        cursor.close()

    task_runs = {name: 0 for name in EXPECTED_TASKS}
    task_runs["FAILED"] = 0
    for row in task_history:
        name = _string(row.get("name"))
        task_runs[name] = int(task_runs.get(name, 0)) + 1
        if _string(row.get("state")).upper() == "FAILED":
            task_runs["FAILED"] += 1
    return {
        "dashboard_health": dashboard.get("health"),
        "metrics": metric_row,
        "monitors": monitors,
        "streams": streams,
        "task_runs": task_runs,
        "tasks": tasks,
        "warehouses": warehouses,
    }


def sanitized_report(state: Mapping[str, Any], findings: list[str]) -> dict[str, Any]:
    """Remove mutable data content while preserving release evidence."""
    metrics = state.get("metrics", {})
    return {
        "capturedAt": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "dashboardHealth": state.get("dashboard_health"),
        "findings": findings,
        "metrics": (
            {str(key): int(value or 0) for key, value in metrics.items()}
            if isinstance(metrics, Mapping)
            else {}
        ),
        "monitorCount": len(state.get("monitors", [])),
        "passed": not findings,
        "streamModes": {
            _string(row.get("name")): _string(row.get("mode"))
            for row in state.get("streams", [])
            if isinstance(row, Mapping)
        },
        "taskRunsLastTwoHours": state.get("task_runs", {}),
        "taskStates": {
            _string(row.get("name")): _string(row.get("state"))
            for row in state.get("tasks", [])
            if isinstance(row, Mapping)
        },
        "warehouseStates": {
            _string(row.get("name")): _string(row.get("state"))
            for row in state.get("warehouses", [])
            if isinstance(row, Mapping)
        },
    }


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit the live Consera release")
    parser.add_argument("--connection", required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = _arguments()
    connection = snowflake.connector.connect(connection_name=args.connection)
    try:
        state = collect_release_state(connection)
    finally:
        connection.close()
    findings = validate_release_state(state)
    report = sanitized_report(state, findings)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    if findings:
        print("\n".join(findings))
        return 1
    print("Consera live release audit passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
