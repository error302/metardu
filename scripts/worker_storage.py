#!/usr/bin/env python3
"""METARDU Worker — File / result storage helpers.

Provides:
  - OUTPUT_DIR: constant path for worker-generated files.
  - ensure_output_dir(): Create the output directory if absent.
  - save_geojson(data, filename): Persist a GeoJSON dict and return the path.
  - save_pdf_report(data, filename): Persist a PDF bytestring and return the path.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger("metardu.worker.storage")

# Default output directory — resolve relative to the metardu project root.
# PM2 runs from ~/metardu, so os.getcwd() is the project root.
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.getenv(
    "WORKER_OUTPUT_DIR",
    os.path.join(os.getcwd(), "download", "worker-output"),
)
# Fallback: if cwd is not the project root, use __file__-based resolution
if not os.path.exists(os.path.dirname(OUTPUT_DIR)):
    OUTPUT_DIR = os.getenv(
        "WORKER_OUTPUT_DIR",
        os.path.join(_PROJECT_ROOT, "download", "worker-output"),
    )


def ensure_output_dir() -> Path:
    """Create the worker output directory if it does not already exist."""
    p = Path(OUTPUT_DIR)
    p.mkdir(parents=True, exist_ok=True)
    logger.info("output_dir_ready", extra={"event": "output_dir_ready", "path": str(p)})
    return p


def save_geojson(data: dict, filename: str) -> str:
    """Write *data* as a GeoJSON file and return the absolute file path."""
    ensure_output_dir()
    filepath = Path(OUTPUT_DIR) / filename
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    logger.info("geojson_saved", extra={
        "event": "geojson_saved",
        "path": str(filepath),
        "size_bytes": filepath.stat().st_size,
    })
    return str(filepath)


def save_pdf_report(data: bytes, filename: str) -> str:
    """Write raw PDF *data* (bytes) to disk and return the absolute file path."""
    ensure_output_dir()
    filepath = Path(OUTPUT_DIR) / filename
    with open(filepath, "wb") as f:
        f.write(data)
    logger.info("pdf_saved", extra={
        "event": "pdf_saved",
        "path": str(filepath),
        "size_bytes": filepath.stat().st_size,
    })
    return str(filepath)
