"""Ensure the flat-module worker layout wires its optional routers and tasks."""

import sys
import asyncio
import json
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


def test_worker_exposes_only_registered_task_contracts() -> None:
    assert "/capabilities" in main.app.openapi()["paths"]
    result = asyncio.run(main.capabilities(main.Response()))
    assert result == {
        "protocol": "metardu-compute-v1",
        "tasks": {
            "gnss_baseline_process": "rtklib-relative-v1",
            "parse_lidar": "las-laz-preview-v1",
        },
    }


def test_wrong_contract_is_rejected_before_solver_execution(monkeypatch) -> None:
    calls = []

    async def solver(params):
        calls.append(params)
        raise AssertionError("Incompatible work must never reach the solver")

    monkeypatch.setitem(main.TASK_REGISTRY, "gnss_baseline_process", solver)
    request = main.ComputeRequest(task="gnss_baseline_process", params={}, contract="old")
    result = asyncio.run(main.compute(request))
    assert result.status_code == 409
    assert json.loads(result.body)["success"] is False
    assert calls == []


def test_contract_bound_lidar_response_keeps_the_actual_task_result(monkeypatch) -> None:
    async def parser(params):
        return {"pointCount": 0, "sourceCrs": None, "points": []}

    monkeypatch.setitem(main.TASK_REGISTRY, "parse_lidar", parser)
    request = main.ComputeRequest(task="parse_lidar", params={}, contract="las-laz-preview-v1")
    result = asyncio.run(main.compute(request)).model_dump()
    assert result["success"] is True
    assert result["task"] == "parse_lidar"
    assert result["contract"] == "las-laz-preview-v1"
    assert result["data"] == {"pointCount": 0, "sourceCrs": None, "points": []}
