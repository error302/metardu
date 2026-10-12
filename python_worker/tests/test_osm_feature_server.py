"""Fail-closed behavior for the optional local OSM PBF service."""

import asyncio
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

WORKER_ROOT = Path(__file__).resolve().parents[1]
if str(WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_ROOT))

import osm_feature_server  # noqa: E402


def run(coro):
    return asyncio.run(coro)


def test_features_reports_unconfigured_pbf_as_unavailable(monkeypatch):
    monkeypatch.setattr(osm_feature_server, "get_pbf_reader", lambda: None)

    with pytest.raises(HTTPException) as error:
        run(osm_feature_server.get_features(36.8, -1.3, 36.81, -1.29, "buildings"))

    assert error.value.status_code == 503
    assert "Local OSM PBF service is not ready" in error.value.detail


@pytest.mark.parametrize(
    ("bbox", "message"),
    [
        ((36.81, -1.3, 36.8, -1.29), "minimums must be below maximums"),
        ((float("nan"), -1.3, 36.8, -1.29), "must be finite"),
        ((181, -1.3, 182, -1.29), "Longitude coordinates"),
        ((36.8, -91, 36.81, -90), "Latitude coordinates"),
    ],
)
def test_features_rejects_invalid_wgs84_bounds_before_loading_data(monkeypatch, bbox, message):
    monkeypatch.setattr(
        osm_feature_server,
        "get_pbf_reader",
        lambda: pytest.fail("invalid bounds must be rejected before touching the PBF"),
    )

    with pytest.raises(HTTPException) as error:
        run(osm_feature_server.get_features(*bbox, "buildings"))

    assert error.value.status_code == 400
    assert message in error.value.detail


@pytest.mark.parametrize("types", ["", "buildings,unknown", "unknown"])
def test_features_rejects_empty_or_unknown_feature_types(monkeypatch, types):
    monkeypatch.setattr(
        osm_feature_server,
        "get_pbf_reader",
        lambda: pytest.fail("invalid feature types must be rejected before touching the PBF"),
    )

    with pytest.raises(HTTPException) as error:
        run(osm_feature_server.get_features(36.8, -1.3, 36.81, -1.29, types))

    assert error.value.status_code == 400


def test_bbox_filter_fails_closed_when_source_crs_is_missing():
    class FeatureFrameWithoutCrs:
        crs = None
        columns = ["geometry"]

        def __len__(self):
            return 1

    with pytest.raises(RuntimeError, match="Could not safely filter"):
        osm_feature_server.filter_by_bbox(FeatureFrameWithoutCrs(), 36.8, -1.3, 36.81, -1.29)


def test_extraction_errors_are_not_reported_as_empty_success(monkeypatch):
    class BrokenReader:
        def get_buildings(self):
            raise OSError("corrupt PBF")

    monkeypatch.setattr(osm_feature_server, "get_pbf_reader", lambda: BrokenReader())

    with pytest.raises(HTTPException) as error:
        osm_feature_server.get_buildings(36.8, -1.3, 36.81, -1.29)

    assert error.value.status_code == 500
    assert "no feature data was returned" in error.value.detail
