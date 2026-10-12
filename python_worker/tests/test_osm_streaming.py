"""Optional local-PBF streaming must fail honestly when unprovisioned."""

import asyncio
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

WORKER_ROOT = Path(__file__).resolve().parents[1]
if str(WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_ROOT))

import osm_streaming  # noqa: E402


def run(coro):
    return asyncio.run(coro)


def test_stream_route_reports_missing_pyosmium_as_unavailable(monkeypatch):
    monkeypatch.setattr(osm_streaming, "get_osmium", lambda: None)
    request = osm_streaming.StreamExtractRequest(
        output_path="survey-area.geojson",
        bbox=[36.8, -1.3, 36.81, -1.29],
        filters={"buildings": True},
    )

    with pytest.raises(HTTPException) as error:
        run(osm_streaming.api_stream_extract(request))

    assert error.value.status_code == 503
    assert "install Pyosmium" in error.value.detail


def test_stream_route_reports_bad_pbf_path_as_unavailable(monkeypatch):
    monkeypatch.setattr(osm_streaming, "get_osmium", lambda: object())
    monkeypatch.setenv("OSM_PBF_PATH", r"C:\__metardu_missing_test__\missing.osm.pbf")
    request = osm_streaming.StreamExtractRequest(
        output_path="survey-area.geojson",
        bbox=[36.8, -1.3, 36.81, -1.29],
        filters={"buildings": True},
    )

    with pytest.raises(HTTPException) as error:
        run(osm_streaming.api_stream_extract(request))

    assert error.value.status_code == 503
    assert "No PBF file found" in error.value.detail
