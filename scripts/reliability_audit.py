"""Static release breakers for Consera's cost and self-retrigger failure modes."""

from __future__ import annotations

import json
import re

from scripts.build_snowpark_bundle import REPO_ROOT
from scripts.cloudflare_cost_guard import cost_guard_findings

WORKFLOW = REPO_ROOT / ".github" / "workflows" / "hn-ingestion.yml"
QUALITY_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci.yml"
BOOTSTRAP = REPO_ROOT / "snowflake" / "bootstrap" / "00_account_resources.sql"
TASK_GRAPH = REPO_ROOT / "snowflake" / "migrations" / "V005__cost_safe_task_graph.sql"
RUNTIME = REPO_ROOT / "snowflake" / "procedures" / "consera_core" / "runtime.py"
SNAPSHOT = REPO_ROOT / "apps" / "api" / "src" / "snapshot" / "workspace.json"
WORKER_CONFIG = REPO_ROOT / "apps" / "api" / "wrangler.jsonc"
WORKSPACE_CACHE = REPO_ROOT / "apps" / "api" / "src" / "workspace-cache.ts"


def _missing(source: str, required: tuple[str, ...], prefix: str) -> list[str]:
    return [
        f"{prefix}_{index}" for index, value in enumerate(required, start=1) if value not in source
    ]


def reliability_findings(*, require_snapshot: bool = True) -> list[str]:
    """Return stable codes for regressions that can create cost, outage, or false-green state."""
    workflow = WORKFLOW.read_text(encoding="utf-8")
    bootstrap = BOOTSTRAP.read_text(encoding="utf-8")
    quality_workflow = QUALITY_WORKFLOW.read_text(encoding="utf-8")
    task_graph = TASK_GRAPH.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    worker_config = WORKER_CONFIG.read_text(encoding="utf-8")
    workspace_cache = WORKSPACE_CACHE.read_text(encoding="utf-8")
    findings = list(cost_guard_findings())

    cron_values = re.findall(r'cron:\s*["\']([^"\']+)["\']', workflow)
    if cron_values != ["17 3 * * *"]:
        findings.append("INGESTION_SCHEDULE_NOT_ONCE_DAILY")
    if "workflow_dispatch:" not in workflow:
        findings.append("MANUAL_INGESTION_MISSING")
    action_uses = re.findall(r"uses:\s*([^@\s]+)@([^\s#]+)", workflow)
    if any(not re.fullmatch(r"[0-9a-f]{40}", revision) for _action, revision in action_uses):
        findings.append("INGESTION_ACTION_NOT_SHA_PINNED")

    required_quality_commands = (
        "pnpm install --frozen-lockfile",
        "uv sync --frozen",
        "pnpm format:check",
        "pnpm lint",
        "pnpm typecheck",
        "pnpm test",
        "pnpm build",
        "pnpm --filter @consera/api cf-typegen:check",
        "uv run ruff check .",
        "uv run ruff format --check .",
        "uv run mypy snowflake bridges scripts",
        "uv run pytest",
        "uv run sqlfluff lint snowflake/",
        "scripts/cloudflare_cost_guard.py",
        "python -m scripts.reliability_audit",
        "test:e2e",
    )
    findings.extend(_missing(quality_workflow, required_quality_commands, "QUALITY_GATE_MISSING"))
    quality_actions = re.findall(
        r"uses:\s*([^@\s]+)@([^\s#]+)",
        quality_workflow,
    )
    if any(not re.fullmatch(r"[0-9a-f]{40}", revision) for _action, revision in quality_actions):
        findings.append("QUALITY_ACTION_NOT_SHA_PINNED")
    if "secrets." in quality_workflow:
        findings.append("QUALITY_WORKFLOW_CAN_WAKE_LIVE_PLATFORM")

    findings.extend(
        _missing(
            bootstrap,
            (
                "CONSERA_INGEST_MONITOR",
                "CONSERA_PIPELINE_MONITOR",
                "CONSERA_APP_MONITOR",
                "CREDIT_QUOTA = 1",
                "FREQUENCY = WEEKLY",
                "WAREHOUSE_SIZE = 'XSMALL'",
                "AUTO_SUSPEND = 60",
                "ENABLE_QUERY_ACCELERATION = FALSE",
            ),
            "COST_BOUNDARY_MISSING",
        )
    )
    if re.search(
        r"ALTER WAREHOUSE CONSERA_(?:INGEST|PIPELINE|APP)_WH\s+"
        r"SET RESOURCE_MONITOR = CONSERA_TRIAL_MONITOR",
        bootstrap,
    ):
        findings.append("WAREHOUSES_SHARE_RESOURCE_MONITOR")
    if re.search(r"CREDIT_QUOTA\s*=\s*(?:[2-9]|\d{2,})", bootstrap):
        findings.append("WAREHOUSE_WEEKLY_QUOTA_EXCEEDS_MINIMUM")

    findings.extend(
        _missing(
            task_graph,
            (
                "APPEND_ONLY = TRUE",
                "AFTER APP.PROCESS_LANDING_TASK",
                "AFTER APP.PROCESS_EVALUATION_TASK",
                "OVERLAP_POLICY = NO_OVERLAP",
                "TASK_AUTO_RETRY_ATTEMPTS = 0",
                "DATEADD('hour', -30, CURRENT_TIMESTAMP())",
            ),
            "TASK_GRAPH_GUARD_MISSING",
        )
    )
    evaluation_task = task_graph.split(
        "CREATE OR REPLACE TASK APP.PROCESS_EVALUATION_TASK",
        maxsplit=1,
    )[-1].split("CREATE OR REPLACE TASK APP.PROCESS_ALERT_TASK", maxsplit=1)[0]
    alert_task = task_graph.split(
        "CREATE OR REPLACE TASK APP.PROCESS_ALERT_TASK",
        maxsplit=1,
    )[-1].split("CREATE OR REPLACE SECURE VIEW", maxsplit=1)[0]
    if "SYSTEM$STREAM_HAS_DATA" in evaluation_task or "SYSTEM$STREAM_HAS_DATA" in alert_task:
        findings.append("TASK_CAN_RETRIGGER_FROM_OWN_STATE")

    if "DEFAULT_DAILY_AI_CREDIT_LIMIT = 0.3" not in runtime:
        findings.append("AI_DAILY_CEILING_CHANGED")
    if "min(DEFAULT_DAILY_AI_CREDIT_LIMIT, configured)" not in runtime:
        findings.append("AI_CONFIG_CAN_RAISE_HARD_CEILING")

    if '"compatibility_date": "2026-07-21"' not in worker_config:
        findings.append("WORKER_COMPATIBILITY_DATE_UNVERIFIED")
    if "let liveLoadInFlight" not in workspace_cache or "coalescedLiveLoad" not in workspace_cache:
        findings.append("WORKSPACE_REFRESH_STAMPEDE_GUARD_MISSING")

    production_roots = (
        REPO_ROOT / "apps",
        REPO_ROOT / "bridges",
        REPO_ROOT / "packages",
        REPO_ROOT / "snowflake" / "procedures",
    )
    for root in production_roots:
        for path in sorted(root.rglob("*")):
            if (
                path.suffix not in {".py", ".ts", ".tsx"}
                or "test" in path.name
                or any(
                    part in {"node_modules", ".next", "out", "worker-dist"} for part in path.parts
                )
            ):
                continue
            source = path.read_text(encoding="utf-8")
            if re.search(r"\b(?:TODO|FIXME)\b", source):
                findings.append(f"PLACEHOLDER_MARKER_{path.relative_to(REPO_ROOT).as_posix()}")
            if path.suffix in {".ts", ".tsx"} and any(
                marker in source
                for marker in ("dangerouslySetInnerHTML", ".innerHTML", "eval(", "new Function(")
            ):
                findings.append(f"UNSAFE_RENDER_OR_EVAL_{path.relative_to(REPO_ROOT).as_posix()}")

    if require_snapshot:
        if SNAPSHOT.stat().st_size > 1_000_000:
            findings.append("DEPLOYED_SNAPSHOT_TOO_LARGE")
        snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
        if snapshot.get("ready") is not True:
            findings.append("DEPLOYED_SNAPSHOT_NOT_READY")
        workspace = snapshot.get("workspace")
        projects = (
            workspace.get("dashboard", {}).get("projects", [])
            if isinstance(workspace, dict)
            else []
        )
        active = [project for project in projects if project.get("profileState") == "ACTIVE"]
        if len(active) != 1:
            findings.append("DEPLOYED_SNAPSHOT_ACTIVE_PROJECT_COUNT")

    return findings


def main() -> int:
    findings = reliability_findings()
    if findings:
        print("\n".join(findings))
        return 1
    print("Consera reliability audit passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
