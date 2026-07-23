"""Evidence-bound publication checks."""

from __future__ import annotations

from dataclasses import dataclass

from consera_core.ids import sha256_text


@dataclass(frozen=True)
class EvidenceRecord:
    """Minimal immutable evidence fields needed for publication validation."""

    evidence_id: str
    project_id: str | None
    signal_id: str | None
    excerpt_text: str
    excerpt_sha256: str
    retracted: bool = False


class EvidenceValidationError(ValueError):
    """A safe evidence-publication failure."""


def validate_evidence_bindings(
    *,
    records: list[EvidenceRecord],
    cited_ids: list[str],
    project_id: str,
    signal_id: str,
) -> None:
    """Ensure each citation exists, is intact, is in scope, and is not retracted."""
    if not cited_ids:
        raise EvidenceValidationError("EVIDENCE_REQUIRED")
    by_id = {record.evidence_id: record for record in records}
    if len(by_id) != len(records):
        raise EvidenceValidationError("EVIDENCE_ID_DUPLICATE")
    for evidence_id in cited_ids:
        record = by_id.get(evidence_id)
        if record is None:
            raise EvidenceValidationError("EVIDENCE_NOT_FOUND")
        if record.retracted:
            raise EvidenceValidationError("EVIDENCE_RETRACTED")
        if record.project_id not in (None, project_id):
            raise EvidenceValidationError("EVIDENCE_PROJECT_MISMATCH")
        if record.signal_id not in (None, signal_id):
            raise EvidenceValidationError("EVIDENCE_SIGNAL_MISMATCH")
        if sha256_text(record.excerpt_text) != record.excerpt_sha256:
            raise EvidenceValidationError("EVIDENCE_HASH_MISMATCH")
