"""Measure native Snowflake AI_COMPLETE structured-output support for Consera."""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import snowflake.connector
from snowflake.connector import SnowflakeConnection

from scripts.build_snowpark_bundle import REPO_ROOT

PROCEDURE_ROOT = REPO_ROOT / "snowflake" / "procedures"
if str(PROCEDURE_ROOT) not in sys.path:
    sys.path.insert(0, str(PROCEDURE_ROOT))

from consera_core.runtime import structured_output, variant_dict  # noqa: E402

MODEL_CANDIDATES = ("mistral-large2", "llama3.1-70b", "llama3.1-8b")
REPORT_PATH = REPO_ROOT / "docs" / "evidence" / "platform-contract-report.json"
TEST_SCHEMA = {
    "type": "json",
    "schema": {
        "type": "object",
        "properties": {
            "confidence": {"type": "number"},
            "verdict": {"type": "string"},
        },
        "required": ["confidence", "verdict"],
        "additionalProperties": False,
    },
}
TEST_PROMPT = (
    "Return a JSON object with verdict set to supported and confidence set to 1. "
    "Do not add any other field."
)


@dataclass(frozen=True)
class CandidateResult:
    """Sanitized model-gate result without provider error text."""

    elapsed_ms: int
    model: str
    state: str


def _validate_result(value: object) -> bool:
    envelope = variant_dict(value)
    output = structured_output(envelope)
    return (
        output.get("verdict") == "supported"
        and output.get("confidence") == 1
        and set(output) == {"confidence", "verdict"}
    )


def evaluate_model(connection: SnowflakeConnection, model: str) -> CandidateResult:
    """Run one minimal deterministic structured-output check."""
    started = time.perf_counter()
    state = "FAILED"
    cursor = connection.cursor()
    try:
        cursor.execute("USE ROLE CONSERA_ADMIN_ROLE")
        cursor.execute("USE WAREHOUSE CONSERA_PIPELINE_WH")
        cursor.execute(
            """
            SELECT AI_COMPLETE(
                %s,
                %s,
                OBJECT_CONSTRUCT(
                    'temperature', 0,
                    'top_p', 0,
                    'max_tokens', 100,
                    'guardrails', TRUE
                ),
                PARSE_JSON(%s),
                TRUE
            )
            """,
            (model, TEST_PROMPT, json.dumps(TEST_SCHEMA)),
        )
        row = cursor.fetchone()
        state = "PASSED" if row and _validate_result(row[0]) else "CONTRACT_FAILED"
    except Exception:
        state = "UNAVAILABLE"
    finally:
        cursor.close()
    return CandidateResult(
        elapsed_ms=round((time.perf_counter() - started) * 1000),
        model=model,
        state=state,
    )


def select_native_model(
    connection: SnowflakeConnection,
) -> tuple[str | None, list[CandidateResult]]:
    """Choose the first native model that honors the exact output contract."""
    results: list[CandidateResult] = []
    for model in MODEL_CANDIDATES:
        result = evaluate_model(connection, model)
        results.append(result)
        if result.state == "PASSED":
            return model, results
    return None, results


def persist_selection(connection: SnowflakeConnection, model: str) -> None:
    """Store the measured model in the authoritative pipeline configuration."""
    cursor = connection.cursor()
    try:
        cursor.execute("USE ROLE CONSERA_ADMIN_ROLE")
        cursor.execute(
            """
            UPDATE CONSERA.OPS.PIPELINE_CONFIG
            SET CONFIG_VALUE = TO_VARIANT(%s),
                UPDATED_AT = CURRENT_TIMESTAMP(),
                UPDATED_BY = CURRENT_USER()
            WHERE CONFIG_KEY = 'selected_model'
            """,
            (model,),
        )
    finally:
        cursor.close()


def write_report(
    path: Path,
    selected: str | None,
    results: list[CandidateResult],
) -> None:
    """Write a sanitized, reproducible platform-contract artifact."""
    payload: dict[str, Any] = {
        "ai_complete": {
            "candidates": [asdict(result) for result in results],
            "cross_region_inference_enabled_by_consera": False,
            "selected_model": selected,
            "structured_output_schema": "exact-object-v1",
        },
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "status": "PASSED" if selected else "FAILED_NATIVE_MODEL_GATE",
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Consera Snowflake platform gate")
    parser.add_argument("--connection", required=True)
    parser.add_argument("--report", type=Path, default=REPORT_PATH)
    return parser.parse_args()


def main() -> int:
    """Run the bounded native model gate and persist only a passing selection."""
    args = _arguments()
    connection = snowflake.connector.connect(connection_name=args.connection)
    try:
        selected, results = select_native_model(connection)
        write_report(args.report, selected, results)
        if selected is None:
            print("native Snowflake model gate failed; no selection was persisted")
            return 2
        persist_selection(connection, selected)
        print(f"selected native Snowflake model: {selected}")
        return 0
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
