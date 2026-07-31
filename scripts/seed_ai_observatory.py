"""Create one reviewed, active general-AI project through Consera's real procedures."""

from __future__ import annotations

import argparse
import json
import time
from typing import Any

import snowflake.connector
from snowflake.connector import SnowflakeConnection

from scripts.build_snowpark_bundle import REPO_ROOT

SOURCE = REPO_ROOT / "fixtures" / "projects" / "ai-change-observatory.md"
PROJECT_KEY = "9fabaa02-b536-4d3e-9c4d-3cf4b252b5a2"
ACTIVATION_KEY = "44bcc450-cc43-42be-ad74-7167293ece87"


def _variant(value: object) -> dict[str, Any]:
    decoded = json.loads(value) if isinstance(value, str) else value
    if not isinstance(decoded, dict):
        raise RuntimeError("SNOWFLAKE_VARIANT_INVALID")
    return decoded


def _call(
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
        raise RuntimeError("SNOWFLAKE_PROCEDURE_RESULT_MISSING")
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
                LIMIT 1
                """,
                (project_id,),
            )
            row = cursor.fetchone()
        finally:
            cursor.close()
        if row:
            return _variant(row[0])
        time.sleep(5)
    raise TimeoutError("PROFILE_EXTRACTION_TIMEOUT")


def _reviewed_profile(draft: dict[str, Any], project_id: str) -> dict[str, Any]:
    profile = draft.get("profile")
    if not isinstance(profile, dict):
        raise RuntimeError("PROFILE_DRAFT_INVALID")
    return {
        **profile,
        "capabilities": [
            "Monitor material AI model and API changes",
            "Track AI agents, inference systems, and developer tooling",
            "Compare hosted and open-source AI alternatives",
            "Identify AI security, policy, licensing, and pricing changes",
            "Recommend bounded evidence-backed evaluation actions",
        ],
        "constraints": [
            "Alerts require credible stored evidence",
            "Popularity alone cannot establish production readiness",
            "No automatic purchase, migration, deployment, or source-code change",
        ],
        "dependencies": [
            "Large language models",
            "Generative AI",
            "AI agents",
            "Inference APIs",
            "Retrieval-augmented generation",
            "Vector search",
            "Model evaluation",
        ],
        "differentiators": [
            "Provider-neutral coverage across hosted and open-source AI",
            "Silence-first monitoring with deterministic alert policy",
            "Explicit separation of source fact, assessment, and next action",
        ],
        "monitoredTopics": [
            "artificial intelligence",
            "AI models",
            "large language models",
            "generative AI",
            "AI agents",
            "AI coding assistants",
            "model releases",
            "inference",
            "open-source models",
            "model APIs",
            "RAG",
            "vector databases",
            "AI security",
            "AI policy",
            "model pricing",
        ],
        "projectId": project_id,
        "providers": [
            "OpenAI",
            "Anthropic",
            "Google Gemini",
            "Meta Llama",
            "Mistral",
            "Hugging Face",
            "NVIDIA",
            "Snowflake Cortex",
            "Ollama",
            "vLLM",
        ],
        "summary": (
            "A vendor-neutral intelligence workspace that helps product and engineering teams "
            "identify which AI ecosystem changes deserve investigation, benchmarking, or action."
        ),
        "targetUsers": [
            "Product leaders planning AI capabilities",
            "Engineering teams operating production AI applications",
            "Founders comparing AI models and platforms",
        ],
    }


def seed(connection: SnowflakeConnection, timeout_seconds: int) -> dict[str, Any]:
    source = SOURCE.read_text(encoding="utf-8")
    created = _call(
        connection,
        "CALL CONSERA.APP_API.CREATE_PROJECT(%s, %s, %s, %s)",
        ("AI Change Observatory", source, True, PROJECT_KEY),
    )
    project_id = str(created["id"])
    if created.get("profileState") == "ACTIVE":
        active = created
    else:
        draft = _wait_for_draft(connection, project_id, timeout_seconds)
        profile = _reviewed_profile(draft, project_id)
        active = _call(
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
                ACTIVATION_KEY,
            ),
        )
    archived = _call(
        connection,
        "CALL CONSERA.APP.ARCHIVE_OTHER_PROJECTS(%s)",
        (project_id,),
    )
    return {
        "archivedProjectCount": int(archived["archivedProjectCount"]),
        "projectId": project_id,
        "profileState": active["profileState"],
        "status": "READY",
    }


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create the single Consera AI monitoring project")
    parser.add_argument("--connection", required=True)
    parser.add_argument("--timeout-seconds", type=int, default=300)
    return parser.parse_args()


def main() -> int:
    args = _arguments()
    connection = snowflake.connector.connect(connection_name=args.connection)
    try:
        result = seed(connection, args.timeout_seconds)
    finally:
        connection.close()
    print(json.dumps(result, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
