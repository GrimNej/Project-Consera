from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from snowflake.connector import SnowflakeConnection

from scripts.migrate import _current_user_email


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
