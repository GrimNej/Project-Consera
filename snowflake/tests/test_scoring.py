from __future__ import annotations

import pytest
from consera_core.scoring import (
    ComponentScores,
    ConfidenceInputs,
    calculate_impact_scores,
)
from hypothesis import given
from hypothesis import strategies as st


def components(**overrides: float) -> ComponentScores:
    values = {
        "strategic_relevance": 0.75,
        "capability_overlap": 0.68,
        "dependency_impact": 0.35,
        "competitor_advantage": 0.65,
        "substitutability": 0.62,
        "adoption_friction": 0.35,
        "user_pain_signal": 0.70,
        "solution_adjacency": 0.45,
        "market_momentum": 0.72,
        "evidence_quality": 0.82,
        "time_sensitivity": 0.50,
        "actionability": 0.70,
    }
    values.update(overrides)
    return ComponentScores(**values)


def confidence() -> ConfidenceInputs:
    return ConfidenceInputs(
        source_diversity=0.75,
        profile_completeness=0.86,
        model_schema_reliability=0.98,
        claim_coverage=1.0,
    )


def test_formula_matches_reference_vector() -> None:
    result = calculate_impact_scores(components(), confidence())
    assert result.relevance == pytest.approx(0.628)
    assert result.opportunity == pytest.approx(0.624)
    assert result.threat == pytest.approx(0.6905)
    assert result.replacement_pressure == pytest.approx(0.549)
    assert result.confidence == pytest.approx(0.846)
    assert result.alert_worthiness == pytest.approx(0.69794375)
    assert result.impact_type == "COMPETITIVE_THREAT"


def test_dependency_risk_has_priority() -> None:
    result = calculate_impact_scores(
        components(dependency_impact=0.92, capability_overlap=0.85),
        confidence(),
    )
    assert result.impact_type == "DEPENDENCY_RISK"


@given(st.floats(min_value=0, max_value=1, allow_nan=False, allow_infinity=False))
def test_scores_remain_bounded(value: float) -> None:
    result = calculate_impact_scores(
        ComponentScores(
            strategic_relevance=value,
            capability_overlap=value,
            dependency_impact=value,
            competitor_advantage=value,
            substitutability=value,
            adoption_friction=value,
            user_pain_signal=value,
            solution_adjacency=value,
            market_momentum=value,
            evidence_quality=value,
            time_sensitivity=value,
            actionability=value,
        ),
        ConfidenceInputs(
            source_diversity=value,
            profile_completeness=value,
            model_schema_reliability=value,
            claim_coverage=value,
        ),
    )
    assert all(
        0 <= score <= 1
        for score in (
            result.relevance,
            result.opportunity,
            result.threat,
            result.replacement_pressure,
            result.urgency,
            result.confidence,
            result.impact_peak,
            result.alert_worthiness,
        )
    )


def test_out_of_range_component_is_rejected() -> None:
    with pytest.raises(ValueError, match="evidence_quality"):
        calculate_impact_scores(components(evidence_quality=1.01), confidence())
