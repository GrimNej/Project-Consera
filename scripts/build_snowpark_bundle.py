"""Build the deterministic Snowpark import archive."""

from __future__ import annotations

import hashlib
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = REPO_ROOT / "snowflake" / "procedures"
OUTPUT = REPO_ROOT / "dist" / "snowpark" / "consera_runtime.zip"
ARCHIVE_TIMESTAMP = (2026, 1, 1, 0, 0, 0)


def source_files() -> list[Path]:
    """Return runtime Python sources in stable archive order."""
    return sorted(
        path
        for path in SOURCE_ROOT.rglob("*.py")
        if "__pycache__" not in path.parts and "tests" not in path.parts
    )


def build_bundle(output: Path = OUTPUT) -> tuple[Path, str]:
    """Write a reproducible, source-only Snowpark import zip."""
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for source in source_files():
            name = source.relative_to(SOURCE_ROOT).as_posix()
            info = zipfile.ZipInfo(name, date_time=ARCHIVE_TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, source.read_bytes())
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    return output, digest


def main() -> int:
    """Build and print only the safe artifact path and digest."""
    output, digest = build_bundle()
    print(f"{output.relative_to(REPO_ROOT)} sha256:{digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
