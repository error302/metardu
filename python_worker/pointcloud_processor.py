"""Bounded LAS/LAZ ingestion for the METARDU web point-cloud tool.

This parser preserves the file's source coordinates. It does not reproject data.
Large inputs are deliberately limited to a preview-sized prefix and report
that truncation so callers can prevent engineering calculations on a partial
cloud.
"""

from __future__ import annotations

import base64
import binascii
import io
import math
from typing import Any

MAX_UPLOAD_BYTES = 32 * 1024 * 1024
MAX_RETURNED_POINTS = 100_000

_CLASS_CODES = {
    2: "GROUND",
    3: "LOW-VEG",
    4: "MED-VEG",
    5: "HIGH-VEG",
    6: "BUILDING",
    8: "MODEL-KEY",
    9: "WATER",
}


def _source_crs_metadata(header: Any) -> dict[str, Any]:
    """Return CRS evidence without guessing when LAS has no usable SRS VLR."""
    try:
        crs = header.parse_crs()
    except Exception:
        crs = None

    if crs is None:
        return {
            "crs": None,
            "crsName": None,
            "horizontalUnit": None,
            "metricProjected": False,
        }

    try:
        authority = crs.to_authority()
        crs_label = f"{authority[0]}:{authority[1]}" if authority else crs.to_string()
        axes = list(crs.axis_info[:2])
        metric_projected = (
            bool(crs.is_projected)
            and len(axes) == 2
            and all(
                axis.unit_name.lower() in {"metre", "meter", "metres", "meters"}
                and math.isclose(float(axis.unit_conversion_factor), 1.0, abs_tol=1e-12)
                for axis in axes
            )
        )
        return {
            "crs": crs_label,
            "crsName": crs.name,
            "horizontalUnit": axes[0].unit_name if axes else None,
            "metricProjected": metric_projected,
        }
    except Exception:
        # A malformed/unsupported CRS record remains unknown; never infer a UTM
        # zone from the coordinates themselves.
        return {
            "crs": None,
            "crsName": None,
            "horizontalUnit": None,
            "metricProjected": False,
        }


def parse_lidar_payload(params: dict[str, Any]) -> dict[str, Any]:
    """Parse the first bounded set of LAS/LAZ points from a base64 payload."""
    filename = params.get("filename")
    encoded = params.get("dataBase64")
    requested_limit = params.get("maxPoints", MAX_RETURNED_POINTS)

    if not isinstance(filename, str) or filename.lower().rsplit(".", 1)[-1] not in {"las", "laz"}:
        raise ValueError("Only LAS and LAZ point-cloud files are supported by this endpoint.")
    if not isinstance(encoded, str) or not encoded:
        raise ValueError("The uploaded LAS/LAZ file is empty.")
    max_encoded_bytes = ((MAX_UPLOAD_BYTES + 2) // 3) * 4
    if len(encoded) > max_encoded_bytes:
        raise ValueError(f"LAS/LAZ uploads are limited to {MAX_UPLOAD_BYTES // (1024 * 1024)} MiB.")
    if not isinstance(requested_limit, int) or isinstance(requested_limit, bool) or requested_limit < 1:
        raise ValueError("maxPoints must be a positive integer.")

    try:
        payload = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("The uploaded point-cloud payload is invalid base64.") from exc

    if not payload:
        raise ValueError("The uploaded LAS/LAZ file is empty.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise ValueError(f"LAS/LAZ uploads are limited to {MAX_UPLOAD_BYTES // (1024 * 1024)} MiB.")

    try:
        import laspy

        with laspy.open(io.BytesIO(payload)) as reader:
            header = reader.header
            total_points = int(header.point_count)
            if total_points < 1:
                raise ValueError("The LAS/LAZ file contains no point records.")

            point_format = header.point_format
            if bool(getattr(header, "are_points_compressed", False)) and point_format.id in {4, 5, 9, 10}:
                raise ValueError(
                    "Compressed waveform LAS/LAZ point formats are not supported by the configured lazrs backend. "
                    "Convert the source with a waveform-capable LAZ implementation first."
                )

            returned_limit = min(requested_limit, MAX_RETURNED_POINTS)
            returned_count = min(total_points, returned_limit)
            records = reader.read_points(returned_count)
            xs = records.x
            ys = records.y
            zs = records.z
            classifications = records.classification

            points: list[dict[str, Any]] = []
            for x, y, z, classification in zip(xs, ys, zs, classifications):
                easting, northing, elevation = float(x), float(y), float(z)
                if not all(math.isfinite(value) for value in (easting, northing, elevation)):
                    raise ValueError("The LAS/LAZ file contains non-finite coordinates.")
                class_code = int(classification)
                points.append({
                    "easting": easting,
                    "northing": northing,
                    "rl": elevation,
                    "code": _CLASS_CODES.get(class_code, "DRONE-PC"),
                })

            if len(points) != returned_count:
                raise ValueError("The point records do not match the LAS/LAZ header count.")

            version = header.version
            crs_metadata = _source_crs_metadata(header)
            compressed = bool(getattr(header, "are_points_compressed", False))
            return {
                "points": points,
                "metadata": {
                    "source": "LAS/LAZ Point Cloud",
                    "format": f"{'LAZ' if compressed else 'LAS'} {version.major}.{version.minor} (point format {point_format.id})",
                    "crs": crs_metadata["crs"],
                    "totalPoints": total_points,
                    "processedPoints": len(points),
                    "truncated": len(points) < total_points,
                    "droneSpecific": {
                        "pointDataFormat": point_format.id,
                        "recordLength": point_format.size,
                        "crsName": crs_metadata["crsName"],
                        "horizontalUnit": crs_metadata["horizontalUnit"],
                        "metricProjected": crs_metadata["metricProjected"],
                    },
                },
            }
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Could not read the LAS/LAZ file: {exc}") from exc
