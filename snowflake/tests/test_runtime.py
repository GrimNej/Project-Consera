from __future__ import annotations

import pytest
from consera_core.runtime import PipelineError, structured_output


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


def test_invalid_structured_output_is_rejected() -> None:
    with pytest.raises(PipelineError, match="AI_RESPONSE_ENVELOPE_INVALID"):
        structured_output({"structured_output": []})
