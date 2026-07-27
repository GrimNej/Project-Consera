"""Strict structured-output contracts for Consera Cortex calls."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    """Forbid silent output drift from a selected model."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class ProfileExtraction(StrictModel):
    """Candidate project profile that always requires human review."""

    summary: str = Field(min_length=20, max_length=1200)
    target_users: list[str] = Field(max_length=20)
    capabilities: list[str] = Field(min_length=1, max_length=20)
    dependencies: list[str] = Field(max_length=30)
    providers: list[str] = Field(max_length=20)
    models: list[str] = Field(max_length=20)
    frameworks: list[str] = Field(max_length=20)
    competitors: list[str] = Field(max_length=20)
    differentiators: list[str] = Field(max_length=20)
    constraints: list[str] = Field(max_length=20)
    business_model: str | None = Field(default=None, max_length=500)
    priorities: list[str] = Field(max_length=20)
    risk_sensitivities: list[str] = Field(max_length=20)
    monitored_topics: list[str] = Field(min_length=1, max_length=30)
    unresolved_questions: list[str] = Field(max_length=20)
    confidence: float = Field(ge=0, le=1)

    @field_validator(
        "target_users",
        "capabilities",
        "dependencies",
        "providers",
        "models",
        "frameworks",
        "competitors",
        "differentiators",
        "constraints",
        "priorities",
        "risk_sensitivities",
        "monitored_topics",
        "unresolved_questions",
    )
    @classmethod
    def normalize_facts(cls, values: list[str]) -> list[str]:
        """Remove blank and duplicate facts while preserving model order."""
        normalized: list[str] = []
        seen: set[str] = set()
        for value in values:
            cleaned = " ".join(value.split()).strip()[:240]
            key = cleaned.casefold()
            if cleaned and key not in seen:
                normalized.append(cleaned)
                seen.add(key)
        return normalized


class ComponentAssessment(StrictModel):
    """One rubric-scored component with exact evidence bindings."""

    score: float = Field(ge=0, le=1)
    explanation: str = Field(min_length=1, max_length=3000)
    evidence_ids: list[str] = Field(min_length=1, max_length=8)
    uncertainty: str | None = Field(default=None, max_length=1000)


class RecommendationOutput(StrictModel):
    """Bounded advisory action."""

    action_type: Literal[
        "investigate",
        "benchmark",
        "compare_provider",
        "monitor",
        "strengthen_differentiation",
        "review_dependency",
        "review_license",
        "validate_market",
        "update_roadmap",
        "no_action",
    ]
    title: str = Field(min_length=1, max_length=500)
    rationale: str = Field(min_length=1, max_length=3000)
    effort: Literal["low", "medium", "high"]
    time_horizon: Literal["today", "this_week", "this_month", "watch"]
    evidence_ids: list[str] = Field(min_length=1, max_length=6)


class ProtectiveFactorOutput(StrictModel):
    """Evidence-backed reason a project may be insulated from a signal."""

    factor: str = Field(min_length=1, max_length=1000)
    strength: float = Field(ge=0, le=1)
    evidence_ids: list[str] = Field(min_length=1, max_length=6)


class ContradictionOutput(StrictModel):
    """Conflicting evidence that reduces confidence."""

    description: str = Field(min_length=1, max_length=1500)
    evidence_ids: list[str] = Field(min_length=2, max_length=8)
    severity: Literal["low", "medium", "high"]


class DeepVerdictDraft(StrictModel):
    """Flat provider contract expanded into the richer deterministic domain shape."""

    candidate_verdict_type: Literal[
        "OPPORTUNITY",
        "COMPETITIVE_THREAT",
        "REPLACEMENT_PRESSURE",
        "PROVIDER_OPPORTUNITY",
        "DEPENDENCY_RISK",
        "MARKET_VALIDATION",
        "STRATEGIC_WATCH",
        "IRRELEVANT",
    ]
    headline: str = Field(min_length=1, max_length=500)
    what_happened: str = Field(min_length=1, max_length=5000)
    why_it_matters: str = Field(min_length=1, max_length=7000)
    verdict_summary: str = Field(min_length=1, max_length=5000)
    strategic_relevance: float = Field(ge=0, le=1)
    capability_overlap: float = Field(ge=0, le=1)
    dependency_impact: float = Field(ge=0, le=1)
    competitor_advantage: float = Field(ge=0, le=1)
    substitutability: float = Field(ge=0, le=1)
    adoption_friction: float = Field(ge=0, le=1)
    user_pain_signal: float = Field(ge=0, le=1)
    solution_adjacency: float = Field(ge=0, le=1)
    market_momentum: float = Field(ge=0, le=1)
    evidence_quality: float = Field(ge=0, le=1)
    recommendation_action_type: Literal[
        "investigate",
        "benchmark",
        "compare_provider",
        "monitor",
        "strengthen_differentiation",
        "review_dependency",
        "review_license",
        "validate_market",
        "update_roadmap",
        "no_action",
    ]
    recommendation_title: str = Field(min_length=1, max_length=500)
    recommendation_rationale: str = Field(min_length=1, max_length=3000)
    recommendation_effort: Literal["low", "medium", "high"]
    recommendation_time_horizon: Literal["today", "this_week", "this_month", "watch"]
    protective_factor: str = Field(max_length=1000)
    unknowns: list[str] = Field(max_length=10)
    evidence_ids: list[str] = Field(min_length=1, max_length=8)


class DeepVerdictOutput(StrictModel):
    """Exact evidence-bound deep-analysis result from AI_COMPLETE."""

    candidate_verdict_type: Literal[
        "OPPORTUNITY",
        "COMPETITIVE_THREAT",
        "REPLACEMENT_PRESSURE",
        "PROVIDER_OPPORTUNITY",
        "DEPENDENCY_RISK",
        "MARKET_VALIDATION",
        "STRATEGIC_WATCH",
        "IRRELEVANT",
    ]
    headline: str = Field(min_length=1, max_length=500)
    what_happened: str = Field(min_length=1, max_length=5000)
    why_it_matters: str = Field(min_length=1, max_length=7000)
    verdict_summary: str = Field(min_length=1, max_length=5000)
    strategic_relevance: ComponentAssessment
    capability_overlap: ComponentAssessment
    dependency_impact: ComponentAssessment
    competitor_advantage: ComponentAssessment
    substitutability: ComponentAssessment
    adoption_friction: ComponentAssessment
    user_pain_signal: ComponentAssessment
    solution_adjacency: ComponentAssessment
    market_momentum: ComponentAssessment
    evidence_quality: ComponentAssessment
    recommendations: list[RecommendationOutput] = Field(min_length=1, max_length=5)
    protective_factors: list[ProtectiveFactorOutput] = Field(max_length=5)
    contradictions: list[ContradictionOutput] = Field(max_length=5)
    unknowns: list[str] = Field(max_length=10)
    all_material_claim_evidence_ids: list[str] = Field(min_length=1, max_length=30)

    def components(self) -> dict[str, ComponentAssessment]:
        """Return the exact component set without reflection over unrelated fields."""
        return {
            "strategic_relevance": self.strategic_relevance,
            "capability_overlap": self.capability_overlap,
            "dependency_impact": self.dependency_impact,
            "competitor_advantage": self.competitor_advantage,
            "substitutability": self.substitutability,
            "adoption_friction": self.adoption_friction,
            "user_pain_signal": self.user_pain_signal,
            "solution_adjacency": self.solution_adjacency,
            "market_momentum": self.market_momentum,
            "evidence_quality": self.evidence_quality,
        }


class AskOutput(StrictModel):
    """Structured synthesis over already published evidence-bound dossiers."""

    answer: str = Field(min_length=1, max_length=8000)
    confidence: float = Field(ge=0, le=1)
    limitations: list[str] = Field(max_length=8)
    suggested_action: str | None = Field(default=None, max_length=600)
