import base64
import io

import laspy
import numpy as np
import pytest
from pyproj import CRS

from pointcloud_processor import parse_lidar_payload


def _payload(*, compressed: bool, epsg: int | None = 32737) -> bytes:
    header = laspy.LasHeader(point_format=6, version="1.4")
    header.scales = np.array([0.001, 0.001, 0.001])
    header.offsets = np.array([500000.0, 9800000.0, 1000.0])
    if epsg is not None:
        header.add_crs(CRS.from_epsg(epsg))

    cloud = laspy.LasData(header)
    cloud.x = np.array([500001.125, 500002.250, 500003.375])
    cloud.y = np.array([9800001.5, 9800002.5, 9800003.5])
    cloud.z = np.array([1001.25, 1002.25, 1003.25])
    cloud.classification = np.array([2, 6, 9], dtype=np.uint8)
    data = io.BytesIO()
    cloud.write(data, do_compress=compressed)
    return data.getvalue()


@pytest.mark.parametrize(("compressed", "filename"), [(False, "field.las"), (True, "field.laz")])
def test_reads_las_and_laz_14_crs_and_point_classification(compressed: bool, filename: str) -> None:
    payload = _payload(compressed=compressed)
    result = parse_lidar_payload({
        "filename": filename,
        "dataBase64": base64.b64encode(payload).decode("ascii"),
    })

    assert result["metadata"]["totalPoints"] == 3
    assert result["metadata"]["processedPoints"] == 3
    assert result["metadata"]["truncated"] is False
    assert result["metadata"]["crs"] == "EPSG:32737"
    assert result["metadata"]["droneSpecific"]["metricProjected"] is True
    assert result["points"][0] == {
        "easting": 500001.125,
        "northing": 9800001.5,
        "rl": 1001.25,
        "code": "GROUND",
    }
    assert result["points"][1]["code"] == "BUILDING"
    assert result["metadata"]["format"].startswith("LAZ " if compressed else "LAS ")


def test_reports_truncation_instead_of_misrepresenting_header_count() -> None:
    payload = _payload(compressed=True)
    result = parse_lidar_payload({
        "filename": "field.laz",
        "dataBase64": base64.b64encode(payload).decode("ascii"),
        "maxPoints": 2,
    })

    assert len(result["points"]) == 2
    assert result["metadata"]["processedPoints"] == 2
    assert result["metadata"]["totalPoints"] == 3
    assert result["metadata"]["truncated"] is True


def test_missing_crs_remains_unknown_and_does_not_claim_metric_coordinates() -> None:
    payload = _payload(compressed=False, epsg=None)
    result = parse_lidar_payload({
        "filename": "field.las",
        "dataBase64": base64.b64encode(payload).decode("ascii"),
    })

    assert result["metadata"]["crs"] is None
    assert result["metadata"]["droneSpecific"]["metricProjected"] is False


@pytest.mark.parametrize(
    ("params", "message"),
    [
        ({"filename": "field.xyz", "dataBase64": "eA=="}, "Only LAS and LAZ"),
        ({"filename": "field.las", "dataBase64": "%%%"}, "invalid base64"),
        ({"filename": "field.laz", "dataBase64": base64.b64encode(b"not a cloud").decode("ascii")}, "Could not read"),
    ],
)
def test_rejects_invalid_uploads(params: dict, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        parse_lidar_payload(params)
