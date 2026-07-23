"""Admission controls for project documents and public source text."""

from __future__ import annotations

import html
import re
import unicodedata
from dataclasses import dataclass

MAX_README_BYTES = 200_000
MAX_SOURCE_CHARS = 30_000

_HTML_TAG = re.compile(r"<[^>]{0,1000}>")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_MULTI_SPACE = re.compile(r"[ \t]+")
_MULTI_NEWLINE = re.compile(r"\n{3,}")
_SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("PRIVATE_KEY", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("GITHUB_TOKEN", re.compile(r"\bgh[opsu]_[A-Za-z0-9]{30,}\b")),
    ("AWS_ACCESS_KEY", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    (
        "GENERIC_SECRET",
        re.compile(
            r"(?i)\b(?:api[_ -]?key|password|secret|token)\s*[:=]\s*[\"']?"
            r"[A-Za-z0-9_./+=-]{16,}"
        ),
    ),
)


class AdmissionError(ValueError):
    """Safe, classified document rejection."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class AdmittedDocument:
    """Sanitized README accepted for profile extraction."""

    byte_length: int
    content: str
    secret_scan_status: str


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value).replace("\r\n", "\n").replace("\r", "\n")
    normalized = _CONTROL.sub("", normalized)
    normalized = "\n".join(_MULTI_SPACE.sub(" ", line).rstrip() for line in normalized.split("\n"))
    return _MULTI_NEWLINE.sub("\n\n", normalized).strip()


def admit_readme(raw: bytes) -> AdmittedDocument:
    """Decode, bound, scan, and normalize a UTF-8 README."""
    if len(raw) > MAX_README_BYTES:
        raise AdmissionError("README_TOO_LARGE")
    try:
        decoded = raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise AdmissionError("README_NOT_UTF8") from error
    normalized = _normalize_text(decoded)
    if len(normalized) < 20:
        raise AdmissionError("README_TOO_SHORT")
    for code, pattern in _SECRET_PATTERNS:
        if pattern.search(normalized):
            raise AdmissionError(f"SECRET_SCAN_{code}")
    return AdmittedDocument(
        byte_length=len(raw),
        content=normalized,
        secret_scan_status="PASSED",  # noqa: S106 - classification, not a credential
    )


def sanitize_public_text(value: str | None, limit: int = MAX_SOURCE_CHARS) -> str:
    """Strip markup and controls from public text while preserving readable content."""
    if not value:
        return ""
    without_markup = _HTML_TAG.sub(" ", html.unescape(value))
    return _normalize_text(without_markup)[:limit]
