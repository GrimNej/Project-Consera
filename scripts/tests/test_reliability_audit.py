from __future__ import annotations

from scripts.reliability_audit import reliability_findings


def test_cost_and_retrigger_guards_remain_present() -> None:
    assert reliability_findings(require_snapshot=False) == []
