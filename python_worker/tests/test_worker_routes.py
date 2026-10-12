"""Ensure the flat-module worker layout wires its optional routers and tasks."""

import sys
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1]
if str(WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_ROOT))

import main  # noqa: E402


def test_worker_registers_lidar_and_osm_routes() -> None:
    # FastAPI's included-router wrapper no longer exposes `.path` directly;
    # the generated OpenAPI paths remain the stable public route contract.
    paths = set(main.app.openapi()["paths"])

    assert "parse_lidar" in main.TASK_REGISTRY
    assert "/osm/features" in paths
    assert "/osm/stream-extract" in paths
    assert "/osm/nearby-features" in paths
