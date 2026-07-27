"""Generate isolated local RSA key pairs for Consera service identities."""

from __future__ import annotations

import argparse
import base64
import hashlib
from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIRECTORY = REPO_ROOT / "artifacts" / "private"


@dataclass(frozen=True)
class KeyArtifacts:
    """Paths and public fingerprint safe to report."""

    private_key: Path
    public_key: Path
    public_key_body: Path
    fingerprint: str


def generate_pair(name: str, directory: Path, *, overwrite: bool = False) -> KeyArtifacts:
    """Generate a 2048-bit PKCS8 key pair without printing key material."""
    directory = directory.resolve()
    expected_parent = (REPO_ROOT / "artifacts" / "private").resolve()
    if expected_parent not in (directory, *directory.parents):
        raise ValueError("key directory must stay inside artifacts/private")
    directory.mkdir(parents=True, exist_ok=True)
    private_path = directory / f"{name}.p8"
    public_path = directory / f"{name}.pub.pem"
    body_path = directory / f"{name}.public-key-body.txt"
    targets = (private_path, public_path, body_path)
    if not overwrite and any(path.exists() for path in targets):
        raise FileExistsError(f"key artifacts already exist for {name}")

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_bytes = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    public_der = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    public_body = b"".join(
        line for line in public_bytes.splitlines() if not line.startswith(b"-----")
    )
    private_path.write_bytes(private_bytes)
    public_path.write_bytes(public_bytes)
    body_path.write_bytes(public_body + b"\n")
    fingerprint = base64.b64encode(hashlib.sha256(public_der).digest()).decode("ascii")
    return KeyArtifacts(private_path, public_path, body_path, fingerprint)


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate isolated Consera service key pairs")
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument(
        "--name",
        action="append",
        choices=(
            "consera_admin_service",
            "consera_app_service",
            "consera_ingest_service",
        ),
        help="Generate only the selected identity. May be repeated.",
    )
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def main() -> int:
    """Generate independent Consera service identities."""
    args = _arguments()
    names = args.name or (
        "consera_admin_service",
        "consera_app_service",
        "consera_ingest_service",
    )
    for name in names:
        artifacts = generate_pair(name, args.directory, overwrite=args.overwrite)
        print(
            f"{name}: {artifacts.private_key.relative_to(REPO_ROOT)} "
            f"fingerprint=SHA256:{artifacts.fingerprint}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
