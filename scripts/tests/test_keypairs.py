from __future__ import annotations

from pathlib import Path

import pytest

from scripts.generate_keypairs import generate_pair


def test_key_generation_stays_in_private_artifacts() -> None:
    with pytest.raises(ValueError, match="artifacts/private"):
        generate_pair("outside", Path.cwd())
