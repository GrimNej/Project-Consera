"""Apply Consera account bootstrap and versioned migrations without secret output."""

from __future__ import annotations

import argparse
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
    for path in migrations:
        if path.name == "V003__ingestion_and_runtime.sql":
            cursor = connection.cursor()
            try:
                normalized = bundle.resolve().as_posix()
                cursor.execute(
                    f"PUT 'file://{normalized}' @CONSERA.APP.CODE_STAGE "
                    "AUTO_COMPRESS=FALSE OVERWRITE=TRUE"
                )
            finally:
                cursor.close()
        _execute_stream(connection, path)
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
