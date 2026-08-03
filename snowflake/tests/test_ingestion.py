from __future__ import annotations

from ingestion import (
    CANDIDATE_MIN_RELEVANCE,
    lexical_relevance,
    optional_number_param,
    topic_labels,
)


def test_exact_provider_match_enters_candidate_band() -> None:
    score = lexical_relevance(
        ["Snowflake Cortex", "evidence-bound product intelligence"],
        "Snowflake Cortex introduces a lower latency complete function",
    )
    assert score >= CANDIDATE_MIN_RELEVANCE


def test_two_specific_shared_terms_enter_candidate_band() -> None:
    score = lexical_relevance(
        [
            "Cloudflare Workers",
            "Snowflake Cortex",
            "project consequence intelligence",
            "evidence-backed alerts",
            "Hacker News",
            "static Next.js frontend",
        ],
        "A Snowflake project ships evidence-backed monitoring",
    )
    assert score >= CANDIDATE_MIN_RELEVANCE


def test_unrelated_story_is_silent() -> None:
    score = lexical_relevance(
        ["Snowflake Cortex", "developer intelligence"],
        "A photo essay about urban gardening",
    )
    assert score == 0


def test_topic_labels_include_domain_and_stable_terms() -> None:
    labels = topic_labels(
        "Cortex intelligence arrives for developers",
        "https://www.example.com/release",
    )
    assert labels[0] == "example.com"
    assert labels[1:] == ["intelligence", "developers", "arrives"]


def test_optional_signal_metrics_do_not_bind_python_none() -> None:
    assert optional_number_param(None) == ""
    assert optional_number_param(0) == "0"
    assert optional_number_param(42) == "42"
