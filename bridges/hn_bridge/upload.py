"""Least-privilege Snowflake batch uploader."""

from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from typing import Any

import snowflake.connector
from cryptography.hazmat.primitives import serialization

from hn_bridge.models import IngestBatch


class ConfigurationError(RuntimeError):
    """Missing or malformed bridge configuration."""


@dataclass(frozen=True)
class SnowflakeSettings:
    """Exact bridge connection contract."""

    account: str
    user: str
    private_key_b64: str
    private_key_passphrase: str | None
    warehouse: str
    database: str
    role: str

    @classmethod
    def from_environment(cls) -> SnowflakeSettings:
        """Load required values without ever logging them."""
        required = {
            "account": "SNOWFLAKE_ACCOUNT",
            "user": "SNOWFLAKE_USER",
            "private_key_b64": "SNOWFLAKE_PRIVATE_KEY_B64",
            "warehouse": "SNOWFLAKE_WAREHOUSE",
            "database": "SNOWFLAKE_DATABASE",
            "role": "SNOWFLAKE_ROLE",
        }
        values: dict[str, str] = {}
        for field, name in required.items():
            value = os.environ.get(name, "").strip()
            if not value:
                raise ConfigurationError(f"MISSING_{name}")
            values[field] = value
        return cls(
            **values,
            private_key_passphrase=os.environ.get("SNOWFLAKE_PRIVATE_KEY_PASSPHRASE") or None,
        )

    def private_key_der(self) -> bytes:
        """Decode an in-memory key and return unencrypted PKCS8 DER for the connector."""
        try:
            pem = base64.b64decode(self.private_key_b64, validate=True)
            password = (
                self.private_key_passphrase.encode("utf-8") if self.private_key_passphrase else None
            )
            key = serialization.load_pem_private_key(pem, password=password)
            return key.private_bytes(
                encoding=serialization.Encoding.DER,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
        except (ValueError, TypeError) as error:
            raise ConfigurationError("PRIVATE_KEY_INVALID") from error


def upload_batch(batch: IngestBatch, settings: SnowflakeSettings) -> dict[str, Any]:
    """Call the sole ingestion procedure and return its sanitized result."""
    connection = snowflake.connector.connect(
        account=settings.account,
        user=settings.user,
        private_key=settings.private_key_der(),
        warehouse=settings.warehouse,
        database=settings.database,
        schema="LANDING",
        role=settings.role,
        session_parameters={"QUERY_TAG": "consera:hn-bridge-v1"},
    )
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                """
                CALL CONSERA.LANDING.INGEST_HN_BATCH(
                    PARSE_JSON(%s),
                    %s,
                    %s
                )
                """,
                (
                    batch.model_dump_json(),
                    batch.payload_sha256,
                    batch.github_run_id or "",
                ),
            )
            row = cursor.fetchone()
            if not row or not isinstance(row[0], dict):
                raise RuntimeError("INGEST_RESULT_INVALID")
            return dict(row[0])
        finally:
            cursor.close()
    finally:
        connection.close()
