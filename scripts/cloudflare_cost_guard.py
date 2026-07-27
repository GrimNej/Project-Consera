"""Fail release validation if Consera introduces metered Cloudflare state."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
WRANGLER_CONFIG = REPO_ROOT / "apps" / "api" / "wrangler.jsonc"
WORKER_SOURCE = REPO_ROOT / "apps" / "api" / "src"
_FORBIDDEN_CONFIG_MARKERS = (
    '"durable_objects"',
    '"kv_namespaces"',
    '"queues"',
    '"triggers"',
)
_FORBIDDEN_SOURCE_MARKERS = ("KVNamespace",)


def cost_guard_findings(
    config_path: Path = WRANGLER_CONFIG,
    source_root: Path = WORKER_SOURCE,
) -> list[str]:
    """Return stable finding codes without printing configuration or source."""
    config = config_path.read_text(encoding="utf-8")
    findings = [
        f"FORBIDDEN_CONFIG_{marker.replace(chr(34), '').upper()}"
        for marker in _FORBIDDEN_CONFIG_MARKERS
        if marker in config
    ]

    for path in sorted(source_root.rglob("*.ts")):
        source = path.read_text(encoding="utf-8")
        findings.extend(
            f"FORBIDDEN_SOURCE_{marker.upper()}"
            for marker in _FORBIDDEN_SOURCE_MARKERS
            if marker in source
        )
    return findings


def main() -> int:
    """Run the zero-metered-state release guard."""
    findings = cost_guard_findings()
    if findings:
        print("\n".join(findings))
        return 1
    print("Cloudflare cost guard passed: no KV, queue, cron, or Durable Object binding")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
