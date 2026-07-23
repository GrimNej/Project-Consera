"""Versioned deterministic Consera impact formulas."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ImpactType = Literal[
    "OPPORTUNITY",
    "COMPETITIVE_THREAT",
    "REPLACEMENT_PRESSURE",
    "PROVIDER_OPPORTUNITY",
    "DEPENDENCY_RISK",
    "MARKET_VALIDATION",
    "STRATEGIC_WATCH",
    "IRRELEVANT",
]

FORMULA_VERSION = "impact-formula-v1"
IMPACT_TYPE_VERSION = "impact-type-v1"


@dataclass(frozen=True)
class ComponentScores:
    """The exact model-assessed component set plus deterministic policy inputs."""

    strategic_relevance: float
    capability_overlap: float
    dependency_impact: float
    competitor_advantage: float
    substitutability: float
    adoption_friction: float
    user_pain_signal: float
    solution_adjacency: float
    market_momentum: float
    evidence_quality: float
    time_sensitivity: float
    actionability: float


@dataclass(frozen=True)
class ConfidenceInputs:
    """Inputs used by the deterministic confidence formula."""

    source_diversity: float
    profile_completeness: float
    model_schema_reliability: float
    claim_coverage: float
    low_contradictions: int = 0
    medium_contradictions: int = 0
    high_contradictions: int = 0
    material_unknowns: int = 0


@dataclass(frozen=True)
class ImpactScores:
    """Published aggregate scores and deterministic classification."""

    relevance: float
    opportunity: float
    threat: float
    replacement_pressure: float
    urgency: float
    confidence: float
    impact_peak: float
    alert_worthiness: float
    impact_type: ImpactType


def _clip(value: float) -> float:
    return max(0.0, min(1.0, value))


def _require_score(name: str, value: float) -> None:
    if not 0.0 <= value <= 1.0:
        raise ValueError(f"{name} must be between 0 and 1")


def _validate_components(components: ComponentScores) -> None:
    for name, value in vars(components).items():
        _require_score(name, value)


def _validate_confidence(inputs: ConfidenceInputs) -> None:
    for name in (
        "source_diversity",
        "profile_completeness",
        "model_schema_reliability",
        "claim_coverage",
    ):
        _require_score(name, getattr(inputs, name))
    for name in (
        "low_contradictions",
        "medium_contradictions",
        "high_contradictions",
        "material_unknowns",
    ):
        value = getattr(inputs, name)
        if value < 0:
            raise ValueError(f"{name} must be non-negative")


def calculate_confidence(components: ComponentScores, inputs: ConfidenceInputs) -> float:
    """Calculate confidence from evidence, coverage, reliability, and penalties."""
    _validate_components(components)
    _validate_confidence(inputs)
    base = (
        0.45 * components.evidence_quality
        + 0.20 * inputs.source_diversity
        + 0.15 * inputs.profile_completeness
        + 0.10 * inputs.model_schema_reliability
        + 0.10 * inputs.claim_coverage
    )
    contradiction_penalty = min(
        0.40,
        0.08 * inputs.low_contradictions
        + 0.15 * inputs.medium_contradictions
        + 0.25 * inputs.high_contradictions,
    )
    unknown_penalty = min(0.20, 0.03 * inputs.material_unknowns)
    return _clip(base - contradiction_penalty - unknown_penalty)


def classify_impact(
    components: ComponentScores,
    relevance: float,
    opportunity: float,
    threat: float,
    replacement_pressure: float,
) -> ImpactType:
    """Apply the impact-type-v1 priority order."""
    if relevance < 0.45:
        return "IRRELEVANT"
    if components.dependency_impact >= 0.72 and threat >= 0.58:
        return "DEPENDENCY_RISK"
    if replacement_pressure >= 0.72:
        return "REPLACEMENT_PRESSURE"
    if threat >= 0.68:
        return "COMPETITIVE_THREAT"
    if opportunity >= 0.68 and components.dependency_impact >= 0.45:
        return "PROVIDER_OPPORTUNITY"
    if opportunity >= 0.65:
        return "OPPORTUNITY"
    if components.user_pain_signal >= 0.68 and components.market_momentum >= 0.55:
        return "MARKET_VALIDATION"
    return "STRATEGIC_WATCH"


def calculate_impact_scores(
    components: ComponentScores,
    confidence_inputs: ConfidenceInputs,
) -> ImpactScores:
    """Calculate all aggregate scores from the fixed v1 formulas."""
    _validate_components(components)
    relevance = _clip(
        0.30 * components.strategic_relevance
        + 0.20 * components.capability_overlap
        + 0.20 * components.dependency_impact
        + 0.10 * components.solution_adjacency
        + 0.10 * components.user_pain_signal
        + 0.10 * components.evidence_quality
    )
    opportunity = _clip(
        0.25 * components.strategic_relevance
        + 0.25 * components.solution_adjacency
        + 0.20 * components.user_pain_signal
        + 0.15 * components.market_momentum
        + 0.10 * components.dependency_impact
        + 0.05 * components.evidence_quality
    )
    threat = _clip(
        0.25 * components.capability_overlap
        + 0.20 * components.competitor_advantage
        + 0.20 * components.substitutability
        + 0.15 * components.strategic_relevance
        + 0.10 * components.market_momentum
        + 0.10 * components.evidence_quality
    )
    replacement_pressure = _clip(
        0.30 * components.substitutability
        + 0.25 * components.capability_overlap
        + 0.15 * components.competitor_advantage
        + 0.15 * components.dependency_impact
        + 0.10 * components.market_momentum
        + 0.05 * components.evidence_quality
        - 0.20 * components.adoption_friction
    )
    confidence = calculate_confidence(components, confidence_inputs)
    impact_peak = max(
        opportunity,
        threat,
        replacement_pressure,
        components.dependency_impact,
    )
    urgency = _clip(
        0.25 * max(threat, opportunity, replacement_pressure)
        + 0.20 * components.dependency_impact
        + 0.15 * components.market_momentum
        + 0.15 * components.strategic_relevance
        + 0.15 * components.time_sensitivity
        + 0.10 * components.evidence_quality
    )
    alert_worthiness = _clip(
        0.30 * relevance
        + 0.25 * impact_peak
        + 0.15 * urgency
        + 0.15 * confidence
        + 0.10 * components.evidence_quality
        + 0.05 * components.actionability
    )
    return ImpactScores(
        relevance=relevance,
        opportunity=opportunity,
        threat=threat,
        replacement_pressure=replacement_pressure,
        urgency=urgency,
        confidence=confidence,
        impact_peak=impact_peak,
        alert_worthiness=alert_worthiness,
        impact_type=classify_impact(
            components,
            relevance,
            opportunity,
            threat,
            replacement_pressure,
        ),
    )
