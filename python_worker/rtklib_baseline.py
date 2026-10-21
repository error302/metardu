"""Bounded, explicit RTKLIB post-processing for relative GNSS baselines."""

from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Callable


MAX_RINEX_CHARS = 25 * 1024 * 1024

_FREQUENCIES = {"l1": "1", "l1+l2": "2", "l1+l2+l5": "3"}
_AMBIGUITY_MODES = {"off", "continuous", "instantaneous", "fix-and-hold"}


def _validated_options(params: dict[str, Any]) -> tuple[dict[str, Any], dict[str, float]]:
    options = params.get("options") or {}
    base = params.get("base_position") or {}
    mode = options.get("mode", "static")
    frequency = options.get("frequency", "l1+l2")
    ambiguity = options.get("ambiguity_resolution", "continuous")
    elevation_mask = options.get("elevation_mask", 15)

    if mode not in {"static", "kinematic"}:
        raise ValueError("Positioning mode must be static or kinematic")
    if frequency not in _FREQUENCIES:
        raise ValueError("Frequency must be L1, L1 + L2, or L1 + L2 + L5")
    if ambiguity not in _AMBIGUITY_MODES:
        raise ValueError("Ambiguity resolution must be off, continuous, instantaneous, or fix-and-hold")
    if isinstance(elevation_mask, bool) or not isinstance(elevation_mask, (int, float)) or not math.isfinite(elevation_mask) or not 0 <= elevation_mask <= 90:
        raise ValueError("Elevation mask must be between 0 and 90 degrees")

    try:
        latitude = float(base["latitude"])
        longitude = float(base["longitude"])
        height = float(base["ellipsoidal_height"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Known base latitude, longitude, and ellipsoidal height are required") from exc
    if not all(math.isfinite(value) for value in (latitude, longitude, height)):
        raise ValueError("Known base coordinates must be finite numbers")
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180 or not -12000 <= height <= 100000:
        raise ValueError("Known base coordinates are outside supported geographic bounds")

    return {
        "mode": mode,
        "frequency": frequency,
        "elevation_mask": float(elevation_mask),
        "ambiguity_resolution": ambiguity,
    }, {"latitude": latitude, "longitude": longitude, "ellipsoidal_height": height}


def _configuration(options: dict[str, Any], base: dict[str, float]) -> str:
    """Build only the RTKLIB 2.4.x options this workflow owns."""
    # Native loadopts/str2enum preserves whitespace after '='. A leading space
    # rejects enum values and can leave single-point defaults active with exit 0.
    return "\n".join((
        f"pos1-posmode={options['mode']}",
        f"pos1-frequency={_FREQUENCIES[options['frequency']]}",
        f"pos1-elmask={options['elevation_mask']:.6g}",
        f"pos2-armode={options['ambiguity_resolution']}",
        "ant1-postype=rinexhead",
        "ant1-anttype=*",
        "ant2-postype=llh",
        f"ant2-pos1={base['latitude']:.12f}",
        f"ant2-pos2={base['longitude']:.12f}",
        f"ant2-pos3={base['ellipsoidal_height']:.4f}",
        "ant2-anttype=*",
        "out-solformat=llh",
        "out-degform=deg",
        "out-height=ellipsoidal",
        "out-outhead=on",
        "out-solstatic=all",
        "",
    ))


def _parse_rtklib_output(output: str) -> dict[str, Any]:
    """Parse the standard RTKLIB LLH .pos row and reject non-relative fixes."""
    rows = [line.strip() for line in output.splitlines() if line.strip() and not line.lstrip().startswith("%")]
    if not rows:
        raise RuntimeError("RTKLIB produced no position rows. Check the RINEX files and overlapping observation epochs.")

    row = rows[-1]
    parts = row.replace(",", " ").split()
    # Standard LLH row: date time lat lon height Q ns sdn sde sdu sdne sdeu sdun age ratio.
    if len(parts) < 15:
        raise RuntimeError(f"Unexpected RTKLIB LLH output row: {row[:200]}")

    try:
        latitude, longitude, height = map(float, parts[2:5])
        quality_flag = int(parts[5])
        satellites = int(parts[6])
        sigma_north, sigma_east, sigma_up = map(float, parts[7:10])
        ratio = float(parts[14])
    except (ValueError, IndexError) as exc:
        raise RuntimeError(f"Failed to parse RTKLIB position row: {row[:200]}") from exc

    values = (latitude, longitude, height, sigma_north, sigma_east, sigma_up, ratio)
    if not all(math.isfinite(value) for value in values):
        raise RuntimeError("RTKLIB returned non-finite coordinates, uncertainty, or ambiguity ratio")
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise RuntimeError("RTKLIB returned coordinates outside geographic bounds")
    if min(sigma_north, sigma_east, sigma_up, ratio) < 0 or satellites < 1:
        raise RuntimeError("RTKLIB returned invalid uncertainty, ratio, or satellite count")

    quality_map = {1: "FIX", 2: "FLOAT"}
    quality = quality_map.get(quality_flag)
    if quality is None:
        labels = {3: "SBAS", 4: "DGPS", 5: "SINGLE", 6: "PPP"}
        status = labels.get(quality_flag, f"status {quality_flag}")
        raise RuntimeError(f"RTKLIB did not produce a relative baseline solution ({status}). Check the base control, antenna metadata, and epoch overlap.")

    return {
        "rover_latitude": latitude,
        "rover_longitude": longitude,
        "rover_height": height,
        "sigma_north": sigma_north,
        "sigma_east": sigma_east,
        "sigma_up": sigma_up,
        "quality": quality,
        "sat_count": satellites,
        "ratio": ratio,
    }


def process_rnx2rtkp_baseline(
    params: dict[str, Any],
    *,
    executable: str | None = None,
    runner: Callable[..., Any] = subprocess.run,
    temp_dir: str | None = None,
) -> dict[str, Any]:
    """Run rnx2rtkp with a known base, bounded files, and explicit input order."""
    rtklib = executable or shutil.which("rnx2rtkp")
    if not rtklib:
        raise RuntimeError("RTKLIB is not installed in the worker container.")

    base_content = params.get("base_rinex", "")
    rover_content = params.get("rover_rinex", "")
    nav_content = params.get("nav_rinex", "")
    if not all(isinstance(value, str) and value.strip() for value in (base_content, rover_content, nav_content)):
        raise ValueError("Base, rover, and navigation RINEX file contents are all required")
    if any(len(value) > MAX_RINEX_CHARS for value in (base_content, rover_content, nav_content)):
        raise ValueError("Each RINEX file must be 25 MiB or smaller")

    options, base = _validated_options(params)
    with tempfile.TemporaryDirectory(prefix="metardu-rtk-", dir=temp_dir) as tmpdir:
        root = Path(tmpdir)
        base_path = root / "base.obs"
        rover_path = root / "rover.obs"
        nav_path = root / "navigation.nav"
        config_path = root / "rtklib.conf"
        output_path = root / "solution.pos"
        base_path.write_text(base_content, encoding="utf-8")
        rover_path.write_text(rover_content, encoding="utf-8")
        nav_path.write_text(nav_content, encoding="utf-8")
        config_path.write_text(_configuration(options, base), encoding="ascii")

        # RTKLIB requires a config file after -k. The first OBS file is rover,
        # and the second is the reference/base station.
        command = [
            rtklib, "-k", str(config_path), "-o", str(output_path),
            str(rover_path), str(base_path), str(nav_path),
        ]
        try:
            result = runner(command, capture_output=True, text=True, timeout=300, check=False)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("RTKLIB timed out after 300 seconds. Try a shorter observation interval.") from exc
        except Exception as exc:
            raise RuntimeError(f"RTKLIB execution failed: {exc}") from exc
        if result.returncode != 0:
            detail = (getattr(result, "stderr", "") or getattr(result, "stdout", "") or "").strip()
            raise RuntimeError(f"RTKLIB error {result.returncode}: {detail[:500] or 'no diagnostic returned'}")
        diagnostics = getattr(result, "stderr", "") or ""
        if any(line.lstrip().lower().startswith("invalid option ") for line in diagnostics.splitlines()):
            raise RuntimeError("RTKLIB rejected its processing configuration; no baseline result was accepted.")

        try:
            output = output_path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            raise RuntimeError("RTKLIB completed without producing its requested solution file") from exc
        return _parse_rtklib_output(output)
