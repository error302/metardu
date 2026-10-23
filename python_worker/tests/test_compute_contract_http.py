"""Exercise the actual FastAPI authentication, admission and LAS/LAZ dispatch."""

import base64
import io
import asyncio

import httpx
import laspy
import numpy as np
import pytest

import main


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main, "WORKER_SECRET", "isolated-contract-http-test")

    def request(method, path, **kwargs):
        async def send():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://worker.test") as connection:
                return await connection.request(method, path, **kwargs)
        return asyncio.run(send())

    return request


AUTH = {"X-Worker-Secret": "isolated-contract-http-test"}


def test_liveness_does_not_expose_authenticated_capabilities(client):
    assert client("GET", "/health").status_code == 200
    assert client("GET", "/capabilities").status_code == 403
    assert client("GET", "/capabilities", headers={"X-Worker-Secret": "wrong"}).status_code == 403
    response = client("GET", "/capabilities", headers=AUTH)
    assert response.status_code == 200
    assert response.json() == {
        "protocol": "metardu-compute-v1",
        "tasks": {"gnss_baseline_process": "rtklib-relative-v1", "parse_lidar": "las-laz-preview-v1"},
    }
    assert response.headers["cache-control"] == "private, no-store"


def test_missing_handler_is_not_advertised_as_a_capability(client, monkeypatch):
    monkeypatch.delitem(main.TASK_REGISTRY, "parse_lidar")
    assert "parse_lidar" not in client("GET", "/capabilities", headers=AUTH).json()["tasks"]


def test_wrong_contract_is_rejected_by_the_http_dispatcher(client):
    response = client("POST", "/compute", headers=AUTH, json={
        "task": "gnss_baseline_process", "params": {}, "contract": "old",
    })
    assert response.status_code == 409
    assert response.json()["success"] is False


@pytest.mark.parametrize("compressed", [False, True])
def test_authenticated_real_point_cloud_round_trip_keeps_zero_and_unknown_reference(client, compressed):
    header = laspy.LasHeader(point_format=6, version="1.4")
    header.scales = np.array([0.001, 0.001, 0.001])
    cloud = laspy.LasData(header)
    cloud.x = np.array([0.0, -12.125])
    cloud.y = np.array([0.0, 8.25])
    cloud.z = np.array([0.0, -1.5])
    cloud.classification = np.array([2, 6], dtype=np.uint8)
    output = io.BytesIO()
    cloud.write(output, do_compress=compressed)
    response = client("POST", "/compute", headers=AUTH, json={
        "task": "parse_lidar", "contract": "las-laz-preview-v1",
        "params": {"filename": "owned.laz" if compressed else "owned.las",
                   "dataBase64": base64.b64encode(output.getvalue()).decode("ascii")},
    })
    assert response.status_code == 200
    envelope = response.json()
    assert envelope["success"] is True
    assert envelope["task"] == "parse_lidar"
    assert envelope["contract"] == "las-laz-preview-v1"
    assert envelope["data"]["points"] == [
        {"easting": 0.0, "northing": 0.0, "rl": 0.0, "code": "GROUND"},
        {"easting": -12.125, "northing": 8.25, "rl": -1.5, "code": "BUILDING"},
    ]
    assert envelope["data"]["metadata"]["crs"] is None
    assert envelope["data"]["metadata"]["droneSpecific"]["metricProjected"] is False
    assert envelope["data"]["metadata"]["processedPoints"] == 2
