from __future__ import annotations

import pytest
from hn_bridge.upload import _resource_monitor_exhausted, _variant_object
from snowflake.connector.errors import ProgrammingError


def test_variant_object_accepts_connector_json_text() -> None:
    assert _variant_object('{"state":"ACCEPTED"}') == {"state": "ACCEPTED"}
    assert _variant_object({"state": "ACCEPTED"}) == {"state": "ACCEPTED"}


def test_variant_object_rejects_non_objects() -> None:
    with pytest.raises(RuntimeError, match="INGEST_RESULT_INVALID"):
        _variant_object("[]")


def test_only_resource_monitor_exhaustion_is_a_budget_pause() -> None:
    budget = ProgrammingError(msg="sanitized", errno=90073)
    authentication = ProgrammingError(msg="sanitized", errno=390100)

    assert _resource_monitor_exhausted(budget)
    assert not _resource_monitor_exhausted(authentication)
