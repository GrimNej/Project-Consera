from __future__ import annotations

from pathlib import Path

from scripts.cloudflare_cost_guard import cost_guard_findings


def test_release_worker_has_no_metered_state_bindings() -> None:
    assert cost_guard_findings() == []


def test_cost_guard_rejects_kv_and_scheduled_bindings(tmp_path: Path) -> None:
    config = tmp_path / "wrangler.jsonc"
    source = tmp_path / "src"
    source.mkdir()
    config.write_text(
        '{"kv_namespaces": [], "triggers": {"crons": ["* * * * *"]}}',
        encoding="utf-8",
    )
    (source / "index.ts").write_text(
        "interface UnsafeBindings { CACHE: KVNamespace }",
        encoding="utf-8",
    )

    assert cost_guard_findings(config, source) == [
        "FORBIDDEN_CONFIG_KV_NAMESPACES",
        "FORBIDDEN_CONFIG_TRIGGERS",
        "FORBIDDEN_SOURCE_KVNAMESPACE",
    ]
