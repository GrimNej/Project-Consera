from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from consera_core.runtime import (
    PipelineError,
    daily_ai_credit_limit,
    snowflake_response_format,
    structured_output,
)


def test_current_structured_output_envelope() -> None:
    assert structured_output({"structured_output": {"answer": "bounded"}}) == {"answer": "bounded"}


def test_wrapped_structured_output_envelope() -> None:
    assert structured_output(
        {
            "structured_output": [
                {
                    "raw_message": {"answer": "bounded"},
                    "type": "json",
                }
            ]
        }
    ) == {"answer": "bounded"}


def test_json_string_structured_output_envelope() -> None:
    assert structured_output({"structured_output": '{"answer":"bounded"}'}) == {"answer": "bounded"}
    assert structured_output({"structured_output": [{"raw_message": '{"answer":"bounded"}'}]}) == {
        "answer": "bounded"
    }


def test_response_format_removes_unsupported_constraints_and_nullable_wrapper() -> None:
    result = snowflake_response_format(
        {
            "type": "json",
            "schema": {
                "title": "Profile",
                "type": "object",
                "properties": {
                    "confidence": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 1,
                    },
                    "business_model": {
                        "anyOf": [
                            {"type": "string", "maxLength": 500},
                            {"type": "null"},
                        ],
                        "default": None,
                    },
                    "topics": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 1,
                        "maxItems": 20,
                    },
                },
            },
        }
    )
    assert result == {
        "type": "json",
        "schema": {
            "type": "object",
            "properties": {
                "confidence": {"type": "number"},
                "business_model": {"type": "string"},
                "topics": {"type": "array", "items": {"type": "string"}},
            },
        },
    }


def test_invalid_structured_output_is_rejected() -> None:
    with pytest.raises(PipelineError, match="AI_RESPONSE_ENVELOPE_INVALID"):
        structured_output({"structured_output": []})


def test_configured_ai_budget_cannot_raise_the_hard_daily_ceiling() -> None:
    session = MagicMock()
    session.sql.return_value.collect.return_value = [{"VALUE": 4.0}]

    assert daily_ai_credit_limit(session) == 0.3
