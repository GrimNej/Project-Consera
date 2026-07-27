from __future__ import annotations

from ingestion import CANDIDATE_MIN_RELEVANCE, lexical_relevance, topic_labels


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
