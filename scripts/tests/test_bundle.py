from __future__ import annotations

import zipfile
from pathlib import Path

from scripts.build_snowpark_bundle import build_bundle


def test_bundle_is_reproducible(tmp_path: Path) -> None:
    first = tmp_path / "first.zip"
    second = tmp_path / "second.zip"
    _, first_hash = build_bundle(first)
    _, second_hash = build_bundle(second)
    assert first_hash == second_hash
    with zipfile.ZipFile(first) as archive:
        names = archive.namelist()
    assert "consera_core/scoring.py" in names
    assert "intelligence.py" in names
    assert all("__pycache__" not in name for name in names)
