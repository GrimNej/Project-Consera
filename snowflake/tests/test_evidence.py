from __future__ import annotations

import pytest
from consera_core.evidence import (
    EvidenceRecord,
    EvidenceValidationError,
    validate_evidence_bindings,
)
from consera_core.ids import sha256_text


def record(**overrides: object) -> EvidenceRecord:
    values: dict[str, object] = {
        "evidence_id": "ev-1",
        "project_id": "project-1",
        "signal_id": "signal-1",
        "excerpt_text": "The project released a lower-latency API.",
        "excerpt_sha256": sha256_text("The project released a lower-latency API."),
    }
    values.update(overrides)
    return EvidenceRecord(**values)  # type: ignore[arg-type]


def test_valid_evidence_binding_passes() -> None:
    validate_evidence_bindings(
        records=[record()],
        cited_ids=["ev-1"],
        project_id="project-1",
        signal_id="signal-1",
    )


@pytest.mark.parametrize(
    ("changed", "message"),
    [
        ({"excerpt_sha256": "0" * 64}, "EVIDENCE_HASH_MISMATCH"),
        ({"project_id": "project-2"}, "EVIDENCE_PROJECT_MISMATCH"),
        ({"signal_id": "signal-2"}, "EVIDENCE_SIGNAL_MISMATCH"),
        ({"retracted": True}, "EVIDENCE_RETRACTED"),
    ],
)
def test_invalid_evidence_is_blocked(changed: dict[str, object], message: str) -> None:
    with pytest.raises(EvidenceValidationError, match=message):
        validate_evidence_bindings(
            records=[record(**changed)],
            cited_ids=["ev-1"],
            project_id="project-1",
            signal_id="signal-1",
        )
