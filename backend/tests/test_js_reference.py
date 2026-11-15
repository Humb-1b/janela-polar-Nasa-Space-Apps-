"""The JS reference file must be what analytic.py produces now (else JS tests
would compare against stale numbers).  Regenerate: python scripts/make_js_reference.py"""
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / "frontend" / "tests" / "fixtures" / "py_reference.json"


def test_reference_file_is_current():
    spec = importlib.util.spec_from_file_location("mkref", ROOT / "scripts" / "make_js_reference.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    fresh = json.loads(json.dumps(mod.build()))
    stored = json.loads(REF.read_text())
    assert len(fresh["cases"]) == len(stored["cases"])
    for a, b in zip(fresh["cases"], stored["cases"]):
        assert a["t_ms"] == b["t_ms"]
        for k, v in a["state"].items():
            assert v == pytest.approx(b["state"][k], abs=1e-9)
