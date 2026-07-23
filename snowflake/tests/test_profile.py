from __future__ import annotations

from consera_core.models import ProfileExtraction
from project_profile import calculate_completeness, compact_readme


def profile(**overrides: object) -> ProfileExtraction:
    values: dict[str, object] = {
        "summary": "A focused product that monitors material technology shifts.",
        "target_users": ["engineering leaders"],
        "capabilities": ["project-specific consequence analysis", "silence-first alerts"],
        "dependencies": ["Snowflake"],
        "providers": ["Cloudflare"],
        "models": [],
        "frameworks": ["Next.js"],
        "competitors": [],
        "differentiators": ["evidence-bound conclusions"],
        "constraints": ["verified evidence only"],
        "business_model": None,
        "priorities": ["high-signal alerts"],
        "risk_sensitivities": ["weak evidence"],
        "monitored_topics": ["Snowflake Cortex", "developer intelligence"],
        "unresolved_questions": [],
        "confidence": 0.84,
    }
    values.update(overrides)
    return ProfileExtraction(**values)  # type: ignore[arg-type]


def test_completeness_is_server_owned() -> None:
    assert calculate_completeness(profile()) == 1.0
    assert (
        calculate_completeness(
            profile(
                dependencies=[],
                providers=[],
                differentiators=[],
            )
        )
        == 0.75
    )


def test_duplicate_facts_are_removed() -> None:
    result = profile(capabilities=["Signal analysis", " signal   analysis ", "Alerts"])
    assert result.capabilities == ["Signal analysis", "Alerts"]


def test_readme_compaction_is_bounded() -> None:
    source = "# Product\n" + ("regular context line\n" * 5000) + "## Dependencies\nSnowflake"
    result = compact_readme(source)
    assert len(result) <= 36_000
    assert result.startswith("# Product")
