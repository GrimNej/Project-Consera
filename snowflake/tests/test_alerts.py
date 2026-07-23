from __future__ import annotations

from consera_core.alerts import AlertPolicyInput, evaluate_alert


def qualified(**overrides: object) -> AlertPolicyInput:
    values: dict[str, object] = {
        "alerts_enabled": True,
        "has_verified_email": True,
        "health_allows_alerts": True,
        "has_critical_audit_finding": False,
        "stale_profile": False,
        "stale_signal": False,
        "duplicate": False,
        "cooldown_active": False,
        "daily_cap_reached": False,
        "impact_type": "COMPETITIVE_THREAT",
        "relevance": 0.82,
        "evidence_quality": 0.84,
        "replacement_pressure": 0.70,
        "dependency_impact": 0.35,
        "confidence": 0.81,
        "alert_worthiness": 0.80,
        "impact_peak": 0.76,
        "has_actionable_recommendation": True,
    }
    values.update(overrides)
    return AlertPolicyInput(**values)  # type: ignore[arg-type]


def test_qualified_verdict_alerts() -> None:
    assert evaluate_alert(qualified()).reason == "QUALIFIED"


def test_weak_evidence_silences_high_score() -> None:
    decision = evaluate_alert(qualified(evidence_quality=0.59))
    assert not decision.should_alert
    assert decision.reason == "LOW_EVIDENCE_QUALITY"


def test_high_severity_override_is_bounded_by_evidence() -> None:
    decision = evaluate_alert(
        qualified(
            confidence=0.63,
            dependency_impact=0.86,
            impact_peak=0.86,
            alert_worthiness=0.66,
        )
    )
    assert decision.should_alert
    assert decision.reason == "HIGH_SEVERITY_OVERRIDE"


def test_safety_gate_precedes_score() -> None:
    decision = evaluate_alert(qualified(has_critical_audit_finding=True))
    assert not decision.should_alert
    assert decision.reason == "AUDIT_BLOCK"
