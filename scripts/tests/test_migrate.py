from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from snowflake.connector import SnowflakeConnection

from scripts.migrate import _current_user_email, _migration_digest, _pending_migrations


def test_migration_digest_detects_immutable_file_drift(tmp_path: Path) -> None:
    migration = tmp_path / "V001__example.sql"
    migration.write_text("SELECT 1;\n", encoding="utf-8")
    first = _migration_digest(migration)
    migration.write_text("SELECT 2;\n", encoding="utf-8")

    assert _migration_digest(migration) != first


def test_pending_migrations_skip_only_an_exact_recorded_digest(tmp_path: Path) -> None:
    first = tmp_path / "V001__first.sql"
    second = tmp_path / "V002__second.sql"
    first.write_text("SELECT 1;\n", encoding="utf-8")
    second.write_text("SELECT 2;\n", encoding="utf-8")

    assert _pending_migrations([first, second], {"V001": _migration_digest(first)}) == [second]


def test_pending_migrations_reject_recorded_checksum_drift(tmp_path: Path) -> None:
    migration = tmp_path / "V001__first.sql"
    migration.write_text("SELECT 1;\n", encoding="utf-8")

    with pytest.raises(RuntimeError, match="MIGRATION_CHECKSUM_DRIFT_V001"):
        _pending_migrations([migration], {"V001": "0" * 64})


def test_current_user_email_stays_inside_the_authenticated_connection() -> None:
    connection = MagicMock(spec=SnowflakeConnection)
    cursor = MagicMock()
    connection.cursor.return_value = cursor
    cursor.fetchone.return_value = ("owner@example.com",)

    assert _current_user_email(connection) == "owner@example.com"
    cursor.close.assert_called_once()


def test_current_user_email_rejects_missing_account_metadata() -> None:
    connection = MagicMock(spec=SnowflakeConnection)
    cursor = MagicMock()
    connection.cursor.return_value = cursor
    cursor.fetchone.return_value = (None,)

    with pytest.raises(RuntimeError, match="no usable configured email"):
        _current_user_email(connection)
