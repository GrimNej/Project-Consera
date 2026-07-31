"""Apply Consera account bootstrap and versioned migrations without secret output."""

from __future__ import annotations

import argparse
import hashlib
import io
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import snowflake.connector
from snowflake.connector import SnowflakeConnection

from scripts.build_snowpark_bundle import REPO_ROOT, build_bundle

BOOTSTRAP = REPO_ROOT / "snowflake" / "bootstrap" / "00_account_resources.sql"
MIGRATIONS = REPO_ROOT / "snowflake" / "migrations"


def _connection(name: str) -> SnowflakeConnection:
    return snowflake.connector.connect(connection_name=name)


def _execute_stream(connection: SnowflakeConnection, path: Path) -> None:
    stream = io.StringIO(path.read_text(encoding="utf-8"))
    cursors: Iterator[Any] = connection.execute_stream(stream)
    for cursor in cursors:
        cursor.close()


def _migration_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _ensure_migration_history(connection: SnowflakeConnection) -> None:
    cursor = connection.cursor()
    try:
        cursor.execute("USE ROLE CONSERA_ADMIN_ROLE")
        cursor.execute("USE WAREHOUSE CONSERA_PIPELINE_WH")
        cursor.execute("USE DATABASE CONSERA")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS CONSERA.OPS.SCHEMA_MIGRATIONS (
                VERSION VARCHAR(32) NOT NULL,
                FILE_NAME VARCHAR(255) NOT NULL,
                SHA256 VARCHAR(64) NOT NULL,
                STATE VARCHAR(32) NOT NULL,
                APPLIED_AT TIMESTAMP_TZ NOT NULL,
                APPLIED_BY VARCHAR(255) NOT NULL
            )
            """
        )
    finally:
        cursor.close()


def _object_exists(
    connection: SnowflakeConnection,
    *,
    object_type: str,
    schema: str,
    name: str,
) -> bool:
    cursor = connection.cursor()
    try:
        if object_type == "TASK":
            cursor.execute("SHOW TASKS LIKE %s IN SCHEMA CONSERA.APP", (name,))
            return cursor.fetchone() is not None
        if object_type == "TABLE":
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM CONSERA.INFORMATION_SCHEMA.TABLES
                WHERE TABLE_NAME = %s
                  AND TABLE_SCHEMA = %s
                """,
                (name, schema),
            )
        elif object_type == "VIEW":
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM CONSERA.INFORMATION_SCHEMA.VIEWS
                WHERE TABLE_NAME = %s
                  AND TABLE_SCHEMA = %s
                """,
                (name, schema),
            )
        elif object_type == "PROCEDURE":
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM CONSERA.INFORMATION_SCHEMA.PROCEDURES
                WHERE PROCEDURE_NAME = %s
                  AND PROCEDURE_SCHEMA = %s
                """,
                (name, schema),
            )
        else:
            raise ValueError("Unsupported migration probe")
        row = cursor.fetchone()
        return bool(row and int(row[0]) > 0)
    finally:
        cursor.close()


def _baseline_existing_migrations(
    connection: SnowflakeConnection,
    migrations: list[Path],
) -> None:
    probes = {
        "V001": ("TABLE", "CORE", "PROJECTS"),
        "V002": ("VIEW", "APP_API", "PROJECT_V"),
        "V003": ("PROCEDURE", "LANDING", "INGEST_HN_BATCH"),
        "V004": ("TASK", "APP", "PROCESS_ALERT_TASK"),
    }
    cursor = connection.cursor()
    try:
        cursor.execute("SELECT COUNT(*) FROM CONSERA.OPS.SCHEMA_MIGRATIONS")
        row = cursor.fetchone()
        if row and int(row[0]) > 0:
            return
    finally:
        cursor.close()

    by_version = {path.name.split("__", maxsplit=1)[0]: path for path in migrations}
    for version, (object_type, schema, name) in probes.items():
        path = by_version.get(version)
        if path is None or not _object_exists(
            connection,
            object_type=object_type,
            schema=schema,
            name=name,
        ):
            break
        cursor = connection.cursor()
        try:
            cursor.execute(
                """
                INSERT INTO CONSERA.OPS.SCHEMA_MIGRATIONS
                    (VERSION, FILE_NAME, SHA256, STATE, APPLIED_AT, APPLIED_BY)
                SELECT %s, %s, %s, 'BASELINED', CURRENT_TIMESTAMP(), CURRENT_USER()
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM CONSERA.OPS.SCHEMA_MIGRATIONS
                    WHERE VERSION = %s
                )
                """,
                (version, path.name, _migration_digest(path), version),
            )
        finally:
            cursor.close()


def _applied_migrations(connection: SnowflakeConnection) -> dict[str, str]:
    cursor = connection.cursor()
    try:
        cursor.execute("SELECT VERSION, SHA256 FROM CONSERA.OPS.SCHEMA_MIGRATIONS")
        return {str(row[0]): str(row[1]) for row in cursor.fetchall()}
    finally:
        cursor.close()


def _pending_migrations(migrations: list[Path], applied: dict[str, str]) -> list[Path]:
    pending: list[Path] = []
    for path in migrations:
        version = path.name.split("__", maxsplit=1)[0]
        applied_digest = applied.get(version)
        if applied_digest is None:
            pending.append(path)
        elif applied_digest != _migration_digest(path):
            raise RuntimeError(f"MIGRATION_CHECKSUM_DRIFT_{version}")
    return pending


def _record_migration(connection: SnowflakeConnection, path: Path) -> None:
    version = path.name.split("__", maxsplit=1)[0]
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO CONSERA.OPS.SCHEMA_MIGRATIONS
                (VERSION, FILE_NAME, SHA256, STATE, APPLIED_AT, APPLIED_BY)
            VALUES (%s, %s, %s, 'APPLIED', CURRENT_TIMESTAMP(), CURRENT_USER())
            """,
            (version, path.name, _migration_digest(path)),
        )
    finally:
        cursor.close()


def bootstrap(
    connection: SnowflakeConnection,
    *,
    admin_public_key: str,
    app_public_key: str,
    ingest_public_key: str,
    alert_email: str,
) -> None:
    """Create only Consera-namespaced account resources."""
    cursor = connection.cursor()
    try:
        cursor.execute("SET CONSERA_ADMIN_PUBLIC_KEY = %s", (admin_public_key,))
        cursor.execute("SET CONSERA_APP_PUBLIC_KEY = %s", (app_public_key,))
        cursor.execute("SET CONSERA_INGEST_PUBLIC_KEY = %s", (ingest_public_key,))
        cursor.execute("SET CONSERA_ALERT_EMAIL = %s", (alert_email,))
    finally:
        cursor.close()
    _execute_stream(connection, BOOTSTRAP)


def migrate(connection: SnowflakeConnection) -> None:
    """Apply migrations in order, uploading code before runtime registration."""
    bundle, _digest = build_bundle()
    migrations = sorted(MIGRATIONS.glob("V*.sql"))
    _ensure_migration_history(connection)
    _baseline_existing_migrations(connection, migrations)
    applied = _applied_migrations(connection)
    pending = _pending_migrations(migrations, applied)
    if pending:
        cursor = connection.cursor()
        try:
            normalized = bundle.resolve().as_posix()
            cursor.execute(
                f"PUT 'file://{normalized}' @CONSERA.APP.CODE_STAGE "
                "AUTO_COMPRESS=FALSE OVERWRITE=TRUE"
            )
        finally:
            cursor.close()
    for path in migrations:
        version = path.name.split("__", maxsplit=1)[0]
        if version in applied:
            print(f"verified {path.name}")
            continue
        _execute_stream(connection, path)
        _record_migration(connection, path)
        print(f"applied {path.name}")


def configure_alert_email(connection: SnowflakeConnection, alert_email: str) -> None:
    """Persist the verified recipient after the OPS configuration table exists."""
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            UPDATE CONSERA.OPS.PIPELINE_CONFIG
            SET CONFIG_VALUE = TO_VARIANT(%s),
                UPDATED_AT = CURRENT_TIMESTAMP()
            WHERE CONFIG_KEY = 'alert_email'
            """,
            (alert_email,),
        )
    finally:
        cursor.close()


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Provision and migrate isolated Consera resources")
    parser.add_argument("--connection", required=True)
    parser.add_argument("--bootstrap", action="store_true")
    parser.add_argument(
        "--use-current-user-email",
        action="store_true",
        help="Use the authenticated Snowflake user's configured email without printing it",
    )
    return parser.parse_args()


def _read_public_key(name: str) -> str:
    path = REPO_ROOT / "artifacts" / "private" / f"{name}.public-key-body.txt"
    return path.read_text(encoding="ascii").strip()


def _current_user_email(connection: SnowflakeConnection) -> str:
    """Reuse a verified Consera recipient before querying account metadata."""
    configured_cursor = connection.cursor()
    try:
        configured_cursor.execute(
            """
            SELECT NULLIF(CONFIG_VALUE::VARCHAR, 'null')
            FROM CONSERA.OPS.PIPELINE_CONFIG
            WHERE CONFIG_KEY = 'alert_email'
            """
        )
        configured_row = configured_cursor.fetchone()
    finally:
        configured_cursor.close()
    configured_email = (
        str(configured_row[0]).strip() if configured_row and configured_row[0] else ""
    )
    if configured_email and "@" in configured_email and len(configured_email) <= 320:
        return configured_email

    account_cursor = connection.cursor()
    try:
        account_cursor.execute(
            """
            SELECT EMAIL
            FROM SNOWFLAKE.ACCOUNT_USAGE.USERS
            WHERE NAME = CURRENT_USER()
              AND DELETED_ON IS NULL
            """
        )
        row = account_cursor.fetchone()
    finally:
        account_cursor.close()
    email = str(row[0]).strip() if row and row[0] else ""
    if not email or "@" not in email or len(email) > 320:
        raise RuntimeError("The authenticated Snowflake user has no usable configured email")
    return email


def main() -> int:
    """Run the explicitly selected infrastructure phase."""
    args = _arguments()
    connection = _connection(args.connection)
    try:
        alert_email = ""
        if args.bootstrap:
            alert_email = os.environ.get("CONSERA_ALERT_EMAIL", "").strip()
            if not alert_email and args.use_current_user_email:
                alert_email = _current_user_email(connection)
            if not alert_email:
                raise RuntimeError(
                    "CONSERA_ALERT_EMAIL or --use-current-user-email is required for bootstrap"
                )
            bootstrap(
                connection,
                admin_public_key=_read_public_key("consera_admin_service"),
                app_public_key=_read_public_key("consera_app_service"),
                ingest_public_key=_read_public_key("consera_ingest_service"),
                alert_email=alert_email,
            )
            print("applied isolated Consera account bootstrap")
        migrate(connection)
        if alert_email:
            configure_alert_email(connection, alert_email)
            print("configured verified Consera alert recipient")
    finally:
        connection.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
