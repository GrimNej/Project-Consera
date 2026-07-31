from __future__ import annotations

from copy import deepcopy

from scripts.live_release_audit import validate_release_state


def valid_state() -> dict[str, object]:
    warehouses = [
        {
            "auto_suspend": 60,
            "enable_query_acceleration": "false",
            "name": warehouse,
            "resource_monitor": monitor,
            "size": "X-Small",
        }
        for warehouse, monitor in (
            ("CONSERA_APP_WH", "CONSERA_APP_MONITOR"),
            ("CONSERA_INGEST_WH", "CONSERA_INGEST_MONITOR"),
            ("CONSERA_PIPELINE_WH", "CONSERA_PIPELINE_MONITOR"),
        )
    ]
    monitors = [
        {"credit_quota": 1, "frequency": "WEEKLY", "name": name}
        for name in (
            "CONSERA_APP_MONITOR",
            "CONSERA_INGEST_MONITOR",
            "CONSERA_PIPELINE_MONITOR",
        )
    ]
    tasks = [
        {
            "condition": "SYSTEM$STREAM_HAS_DATA('CONSERA.LANDING.INGEST_BATCH_STREAM')",
            "name": "PROCESS_LANDING_TASK",
            "predecessors": "[]",
            "state": "started",
        },
        {
            "condition": None,
            "name": "PROCESS_EVALUATION_TASK",
            "predecessors": '["CONSERA.APP.PROCESS_LANDING_TASK"]',
            "state": "started",
        },
        {
            "condition": None,
            "name": "PROCESS_ALERT_TASK",
            "predecessors": '["CONSERA.APP.PROCESS_EVALUATION_TASK"]',
            "state": "started",
        },
        {
            "condition": "SYSTEM$STREAM_HAS_DATA('CONSERA.CORE.PROJECT_DOCUMENT_STREAM')",
            "name": "PROCESS_PROFILE_TASK",
            "predecessors": "[]",
            "state": "started",
        },
    ]
    streams = [
        {"mode": "APPEND_ONLY", "name": name}
        for name in (
            "ALERT_DECISION_STREAM",
            "EVALUATION_JOB_STREAM",
            "INGEST_BATCH_STREAM",
            "PROJECT_DOCUMENT_STREAM",
        )
    ]
    return {
        "metrics": {
            "active_project_count": 1,
            "observatory_count": 1,
            "queue_failure_count": 0,
            "terminal_delivery_failure_count": 0,
            "v005_count": 1,
        },
        "monitors": monitors,
        "streams": streams,
        "task_runs": {
            "FAILED": 0,
            "PROCESS_ALERT_TASK": 1,
            "PROCESS_EVALUATION_TASK": 1,
            "PROCESS_LANDING_TASK": 1,
        },
        "tasks": tasks,
        "warehouses": warehouses,
    }


def test_valid_release_state_has_no_findings() -> None:
    assert validate_release_state(valid_state()) == []


def test_retrigger_and_shared_monitor_regressions_are_detected() -> None:
    state = deepcopy(valid_state())
    tasks = state["tasks"]
    assert isinstance(tasks, list)
    evaluation = next(
        task
        for task in tasks
        if isinstance(task, dict) and task.get("name") == "PROCESS_EVALUATION_TASK"
    )
    evaluation["condition"] = "SYSTEM$STREAM_HAS_DATA('CONSERA.OPS.EVALUATION_JOB_STREAM')"
    task_runs = state["task_runs"]
    assert isinstance(task_runs, dict)
    task_runs["PROCESS_EVALUATION_TASK"] = 8
    warehouses = state["warehouses"]
    assert isinstance(warehouses, list)
    for warehouse in warehouses:
        assert isinstance(warehouse, dict)
        warehouse["resource_monitor"] = "CONSERA_TRIAL_MONITOR"

    findings = validate_release_state(state)

    assert "STATE_TABLE_TRIGGER_REMAINS" in findings
    assert "TASK_GRAPH_MULTIPLICITY_INVALID" in findings
    assert any(finding.endswith("_MONITOR_INVALID") for finding in findings)
