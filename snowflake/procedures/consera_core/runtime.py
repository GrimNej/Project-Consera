"""Snowpark runtime helpers with bounded AI usage and sanitized errors."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from snowflake.snowpark import Row, Session

from consera_core.ids import canonical_json, sha256_text, stable_uuid

DAILY_AI_CREDIT_LIMIT = 0.3
ASSUMED_MAX_CREDITS_PER_CALL = 0.10
_UNSUPPORTED_SCHEMA_KEYWORDS = frozenset(
    {
        "exclusiveMaximum",
        "exclusiveMinimum",
        "format",
        "maxContains",
        "maxItems",
        "maxLength",
        "maxProperties",
        "maximum",
        "minContains",
        "minItems",
        "minLength",
        "minProperties",
        "minimum",
        "multipleOf",
        "patternProperties",
        "propertyNames",
        "uniqueItems",
    }
)
_SCHEMA_ANNOTATIONS = frozenset({"default", "description", "examples", "title"})


class PipelineError(RuntimeError):
    """Classified error safe to store without source or prompt content."""

    def __init__(self, code: str, retryable: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class AiResult:
    """Validated structured output and usage returned by AI_COMPLETE."""

    output: dict[str, Any]
    input_tokens: int
    output_tokens: int


def row_value(row: Row, name: str) -> Any:
    """Read a Snowpark row field using the canonical uppercase identifier."""
    return row[name]


def variant_dict(value: object) -> dict[str, Any]:
    """Decode a Snowflake VARIANT object into a typed Python dictionary."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        decoded = json.loads(value)
        if isinstance(decoded, dict):
            return decoded
    raise PipelineError("VARIANT_CONTRACT_INVALID")


def structured_output(envelope: dict[str, Any]) -> dict[str, Any]:
    """Normalize current and earlier AI_COMPLETE structured-output envelopes."""
    output = envelope.get("structured_output")
    if isinstance(output, str):
        try:
            output = json.loads(output)
        except json.JSONDecodeError as error:
            raise PipelineError("AI_RESPONSE_ENVELOPE_INVALID") from error
    if isinstance(output, dict):
        return output
    if isinstance(output, list) and len(output) == 1 and isinstance(output[0], dict):
        raw_message = output[0].get("raw_message")
        if isinstance(raw_message, str):
            try:
                raw_message = json.loads(raw_message)
            except json.JSONDecodeError as error:
                raise PipelineError("AI_RESPONSE_ENVELOPE_INVALID") from error
        if isinstance(raw_message, dict):
            return raw_message
        return output[0]
    raise PipelineError("AI_RESPONSE_ENVELOPE_INVALID")


def snowflake_response_format(response_format: dict[str, Any]) -> dict[str, Any]:
    """Remove JSON Schema features that Snowflake structured output rejects."""

    def normalize(node: object) -> object:
        if isinstance(node, list):
            return [normalize(item) for item in node]
        if not isinstance(node, dict):
            return node

        any_of = node.get("anyOf")
        if isinstance(any_of, list):
            non_null = [
                option
                for option in any_of
                if not (isinstance(option, dict) and option.get("type") == "null")
            ]
            if len(non_null) == 1 and len(non_null) < len(any_of):
                return normalize(non_null[0])

        return {
            key: normalize(value)
            for key, value in node.items()
            if key not in _UNSUPPORTED_SCHEMA_KEYWORDS and key not in _SCHEMA_ANNOTATIONS
        }

    normalized = normalize(response_format)
    if not isinstance(normalized, dict):
        raise PipelineError("AI_RESPONSE_SCHEMA_INVALID")
    return normalized


def selected_model(session: Session) -> str:
    """Return the model selected by the measured platform gate."""
    rows = session.sql(
        """
        SELECT CONFIG_VALUE::VARCHAR AS MODEL_ID
        FROM CONSERA.OPS.PIPELINE_CONFIG
        WHERE CONFIG_KEY = 'selected_model'
        """
    ).collect()
    if not rows or not row_value(rows[0], "MODEL_ID"):
        raise PipelineError("MODEL_NOT_SELECTED")
    return str(row_value(rows[0], "MODEL_ID"))


def reserve_ai_usage(
    session: Session,
    *,
    operation_type: str,
    project_id: str | None,
    job_id: str | None,
    request_material: dict[str, Any],
    reserved_input_tokens: int,
    reserved_output_tokens: int,
) -> str:
    """Reserve a bounded daily AI call before it can reach Cortex."""
    request_hash = sha256_text(canonical_json(request_material))
    spent_rows = session.sql(
        """
        SELECT COALESCE(SUM(ESTIMATED_CREDITS), 0) AS SPENT
        FROM CONSERA.OPS.AI_USAGE_LEDGER
        WHERE USAGE_DATE = CURRENT_DATE()
          AND STATE IN (
              'RESERVED',
              'IN_FLIGHT',
              'RECONCILED',
              'RECONCILED_PESSIMISTIC',
              'FAILED_TERMINAL'
          )
        """
    ).collect()
    spent = float(row_value(spent_rows[0], "SPENT"))
    if spent + ASSUMED_MAX_CREDITS_PER_CALL > DAILY_AI_CREDIT_LIMIT:
        raise PipelineError("AI_DAILY_BUDGET_EXHAUSTED")

    prior_rows = session.sql(
        """
        SELECT COUNT(*) AS ATTEMPT_COUNT
        FROM CONSERA.OPS.AI_USAGE_LEDGER
        WHERE OPERATION_TYPE = ?
          AND REQUEST_HASH = ?
          AND (
              PROJECT_ID = ?
              OR (PROJECT_ID IS NULL AND ? IS NULL)
          )
          AND (
              JOB_ID = ?
              OR (JOB_ID IS NULL AND ? IS NULL)
          )
        """,
        params=[
            operation_type,
            request_hash,
            project_id,
            project_id,
            job_id,
            job_id,
        ],
    ).collect()
    attempt_number = int(row_value(prior_rows[0], "ATTEMPT_COUNT")) + 1
    usage_id = stable_uuid(
        "ai-usage",
        operation_type,
        request_hash,
        str(attempt_number),
    )

    session.sql(
        """
        MERGE INTO CONSERA.OPS.AI_USAGE_LEDGER AS target
        USING (
            SELECT
                ? AS USAGE_ID,
                ? AS OPERATION_TYPE,
                ? AS MODEL_ID,
                ? AS PROJECT_ID,
                ? AS JOB_ID,
                ? AS REQUEST_HASH,
                ? AS RESERVED_INPUT_TOKENS,
                ? AS RESERVED_OUTPUT_TOKENS
        ) AS source
            ON target.USAGE_ID = source.USAGE_ID
        WHEN NOT MATCHED THEN
            INSERT (
                USAGE_ID,
                USAGE_DATE,
                OPERATION_TYPE,
                MODEL_ID,
                PROJECT_ID,
                JOB_ID,
                REQUEST_HASH,
                STATE,
                RESERVED_INPUT_TOKENS,
                RESERVED_OUTPUT_TOKENS,
                ESTIMATED_CREDITS,
                REQUESTED_AT,
                AMBIGUOUS_CHARGE
            )
            VALUES (
                source.USAGE_ID,
                CURRENT_DATE(),
                source.OPERATION_TYPE,
                source.MODEL_ID,
                source.PROJECT_ID,
                source.JOB_ID,
                source.REQUEST_HASH,
                'RESERVED',
                source.RESERVED_INPUT_TOKENS,
                source.RESERVED_OUTPUT_TOKENS,
                0.10,
                CURRENT_TIMESTAMP(),
                FALSE
            )
        """,
        params=[
            usage_id,
            operation_type,
            selected_model(session),
            project_id,
            job_id,
            request_hash,
            reserved_input_tokens,
            reserved_output_tokens,
        ],
    ).collect()
    return usage_id


def call_ai_complete(
    session: Session,
    *,
    usage_id: str,
    model: str,
    prompt: str,
    response_schema: dict[str, Any],
    max_tokens: int,
) -> AiResult:
    """Call AI_COMPLETE once with structured output and reconcile its usage."""
    session.sql(
        """
        UPDATE CONSERA.OPS.AI_USAGE_LEDGER
        SET STATE = 'IN_FLIGHT'
        WHERE USAGE_ID = ?
          AND STATE = 'RESERVED'
        """,
        params=[usage_id],
    ).collect()
    try:
        rows = session.sql(
            """
            SELECT AI_COMPLETE(
                ?,
                ?,
                OBJECT_CONSTRUCT(
                    'temperature', 0,
                    'top_p', 0,
                    'max_tokens', ?,
                    'guardrails', TRUE
                ),
                PARSE_JSON(?),
                TRUE
            ) AS RESULT
            """,
            params=[
                model,
                prompt,
                max_tokens,
                json.dumps(snowflake_response_format(response_schema)),
            ],
        ).collect()
        envelope = variant_dict(row_value(rows[0], "RESULT"))
        output = structured_output(envelope)
        usage = envelope.get("usage")
        if not isinstance(usage, dict):
            raise PipelineError("AI_RESPONSE_ENVELOPE_INVALID")
        input_tokens = int(usage.get("prompt_tokens", 0))
        output_tokens = int(usage.get("completion_tokens", 0))
    except PipelineError:
        _mark_ai_failure(session, usage_id, "FAILED_TERMINAL")
        raise
    except Exception as error:
        _mark_ai_failure(session, usage_id, "RECONCILED_PESSIMISTIC")
        raise PipelineError("AI_COMPLETE_FAILED", retryable=True) from error

    session.sql(
        """
        UPDATE CONSERA.OPS.AI_USAGE_LEDGER
        SET STATE = 'RECONCILED',
            ACTUAL_INPUT_TOKENS = ?,
            ACTUAL_OUTPUT_TOKENS = ?,
            RECONCILED_AT = CURRENT_TIMESTAMP()
        WHERE USAGE_ID = ?
          AND STATE = 'IN_FLIGHT'
        """,
        params=[input_tokens, output_tokens, usage_id],
    ).collect()
    return AiResult(output=output, input_tokens=input_tokens, output_tokens=output_tokens)


def _mark_ai_failure(session: Session, usage_id: str, state: str) -> None:
    session.sql(
        """
        UPDATE CONSERA.OPS.AI_USAGE_LEDGER
        SET STATE = ?,
            AMBIGUOUS_CHARGE = IFF(? = 'RECONCILED_PESSIMISTIC', TRUE, FALSE),
            RECONCILED_AT = CURRENT_TIMESTAMP()
        WHERE USAGE_ID = ?
          AND STATE IN ('RESERVED', 'IN_FLIGHT')
        """,
        params=[state, state, usage_id],
    ).collect()
