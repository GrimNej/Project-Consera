from __future__ import annotations

from unittest.mock import MagicMock

from consera_core.models import DeepVerdictDraft
from intelligence import _claim_job, _expand_deep_draft
from snowflake.snowpark import Row


def test_flat_verdict_draft_expands_to_evidence_bound_domain_output() -> None:
    draft = DeepVerdictDraft(
        candidate_verdict_type="STRATEGIC_WATCH",
        headline="A bounded signal",
        what_happened="A relevant provider capability changed.",
        why_it_matters="The reviewed project uses that provider.",
        verdict_summary="Monitor the change before altering the roadmap.",
        strategic_relevance=0.7,
        capability_overlap=0.5,
        dependency_impact=0.6,
        competitor_advantage=0.2,
        substitutability=0.3,
        adoption_friction=0.8,
        user_pain_signal=0.4,
        solution_adjacency=0.5,
        market_momentum=0.6,
        evidence_quality=0.9,
        recommendation_action_type="monitor",
        recommendation_title="Monitor the provider release",
        recommendation_rationale="The evidence is relevant but not yet urgent.",
        recommendation_effort="low",
        recommendation_time_horizon="watch",
        protective_factor="The project keeps its provider boundary replaceable.",
        unknowns=["Adoption is not yet measured."],
        evidence_ids=["signal-evidence", "project-evidence"],
    )

    output = _expand_deep_draft(draft)

    assert output.strategic_relevance.score == 0.7
    assert output.recommendations[0].evidence_ids == [
        "signal-evidence",
        "project-evidence",
    ]
    assert output.protective_factors[0].strength == 0.7
    assert set(output.all_material_claim_evidence_ids) == {
        "signal-evidence",
        "project-evidence",
    }


def test_claim_does_not_consume_a_provider_attempt_before_budget_reservation() -> None:
    session = MagicMock()
    session.sql.return_value.collect.return_value = [{"number of rows updated": 1}]

    assert _claim_job(session, Row(JOB_ID="job-1", LEASE_GENERATION=0)) is not None
    statement = session.sql.call_args.args[0]
    assert "STATE = 'CLAIMED'" in statement
    assert "PROVIDER_ATTEMPT_COUNT = PROVIDER_ATTEMPT_COUNT + 1" not in statement
