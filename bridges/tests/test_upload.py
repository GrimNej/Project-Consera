from __future__ import annotations

import pytest
from hn_bridge.upload import _variant_object


def test_variant_object_accepts_connector_json_text() -> None:
    assert _variant_object('{"state":"ACCEPTED"}') == {"state": "ACCEPTED"}
    assert _variant_object({"state": "ACCEPTED"}) == {"state": "ACCEPTED"}


def test_variant_object_rejects_non_objects() -> None:
    with pytest.raises(RuntimeError, match="INGEST_RESULT_INVALID"):
        _variant_object("[]")
