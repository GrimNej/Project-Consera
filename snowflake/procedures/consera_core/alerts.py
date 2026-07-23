"""Silence-first alert policy and suppression accounting."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from consera_core.scoring import ImpactType

ALERT_POLICY_VERSION = "alert-policy-v1"

SuppressionReason = Literal[
    "LOW_RELEVANCE",
    "LOW_IMPACT",
    "LOW_CONFIDENCE",
    "LOW_EVIDENCE_QUALITY",
    "NO_ACTIONABLE_STEP",
    "DUPLICATE",
    "COOLDOWN",
    "STALE_PROFILE",
    "STALE_SIGNAL",
    "ALERTS_DISABLED",
    "NO_VERIFIED_EMAIL",
    "DAILY_CAP_REACHED",
    "SYSTEM_DEGRADED",
    "AUDIT_BLOCK",
]


@dataclass(frozen=True)
class AlertPolicyInput:
    """All inputs required for an auditable alert decision."""

    alerts_enabled: bool
    has_verified_email: bool
    health_allows_alerts: bool
    has_critical_audit_finding: bool
    stale_profile: bool
    stale_signal: bool
    duplicate: bool
    cooldown_active: bool
    daily_cap_reached: bool
    impact_type: ImpactType
    relevance: float
    evidence_quality: float
    replacement_pressure: float
    dependency_impact: float
    confidence: float
    alert_worthiness: float
    impact_peak: float
    has_actionable_recommendation: bool


@dataclass(frozen=True)
class AlertDecision:
    """A deterministic send or suppression result."""

    should_alert: bool
    reason: str


def evaluate_alert(policy: AlertPolicyInput) -> AlertDecision:
    """Apply alert-policy-v1 in stable priority order."""
    if not policy.alerts_enabled:
        return AlertDecision(False, "ALERTS_DISABLED")
    if not policy.has_verified_email:
        return AlertDecision(False, "NO_VERIFIED_EMAIL")
    if not policy.health_allows_alerts:
        return AlertDecision(False, "SYSTEM_DEGRADED")
    if policy.has_critical_audit_finding:
        return AlertDecision(False, "AUDIT_BLOCK")
    if policy.stale_profile:
        return AlertDecision(False, "STALE_PROFILE")
    if policy.stale_signal:
        return AlertDecision(False, "STALE_SIGNAL")
    if policy.duplicate:
        return AlertDecision(False, "DUPLICATE")
    if policy.cooldown_active:
        return AlertDecision(False, "COOLDOWN")
    if policy.daily_cap_reached:
        return AlertDecision(False, "DAILY_CAP_REACHED")
    if policy.impact_type == "IRRELEVANT" or policy.relevance < 0.62:
        return AlertDecision(False, "LOW_RELEVANCE")
    if policy.evidence_quality < 0.60:
        return AlertDecision(False, "LOW_EVIDENCE_QUALITY")
    high_severity = (
        (policy.replacement_pressure >= 0.82 or policy.dependency_impact >= 0.85)
        and policy.confidence >= 0.62
        and policy.evidence_quality >= 0.62
    )
    if high_severity:
        return AlertDecision(True, "HIGH_SEVERITY_OVERRIDE")
    if policy.confidence < 0.68:
        return AlertDecision(False, "LOW_CONFIDENCE")
    if policy.alert_worthiness < 0.68 or policy.impact_peak < 0.62:
        return AlertDecision(False, "LOW_IMPACT")
    if not policy.has_actionable_recommendation:
        return AlertDecision(False, "NO_ACTIONABLE_STEP")
    return AlertDecision(True, "QUALIFIED")
