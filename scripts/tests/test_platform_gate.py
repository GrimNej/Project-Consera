from __future__ import annotations

import json
from pathlib import Path

from scripts.platform_gate import _validate_result, write_report


def test_platform_gate_accepts_only_the_exact_contract() -> None:
    valid = {
        "structured_output": [{"raw_message": {"confidence": 1, "verdict": "supported"}}],
        "usage": {"completion_tokens": 8, "prompt_tokens": 12},
    }
    extra = {
        "structured_output": [
            {"raw_message": {"confidence": 1, "explanation": "extra", "verdict": "supported"}}
        ],
        "usage": {"completion_tokens": 8, "prompt_tokens": 12},
    }
    assert _validate_result(valid)
    assert not _validate_result(extra)


def test_platform_report_is_sanitized_and_machine_readable(tmp_path: Path) -> None:
    report = tmp_path / "platform.json"
    write_report(report, None, [])
    payload = json.loads(report.read_text(encoding="utf-8"))
    assert payload["status"] == "FAILED_NATIVE_MODEL_GATE"
    assert payload["ai_complete"]["cross_region_inference_enabled_by_consera"] is False
