from __future__ import annotations

import pytest
from consera_core.sanitization import AdmissionError, admit_readme, sanitize_public_text


def test_readme_is_normalized() -> None:
    result = admit_readme(b"# Product\r\n\r\nA useful product with clear project context.\r\n")
    assert result.content == "# Product\n\nA useful product with clear project context."
    assert result.secret_scan_status == "PASSED"  # noqa: S105 - classification


def test_private_key_is_rejected() -> None:
    with pytest.raises(AdmissionError, match="SECRET_SCAN_PRIVATE_KEY"):
        admit_readme(b"# Product\n-----BEGIN PRIVATE KEY-----\nnot-real-but-blocked")


def test_non_utf8_is_rejected() -> None:
    with pytest.raises(AdmissionError, match="README_NOT_UTF8"):
        admit_readme(b"# Product\n\xff\xfe")


def test_public_markup_is_plain_text() -> None:
    assert sanitize_public_text("<p>Fast &amp; <b>safe</b></p>") == "Fast & safe"
