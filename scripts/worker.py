#!/usr/bin/env python3
"""METARDU Background Worker — Polls background_jobs table for async tasks.

Implements:
  - PostgreSQL job queue polling with SELECT FOR UPDATE SKIP LOCKED
  - Four job handlers: pdf_generation, report_processing, payment_verification,
    shapefile_generation
  - Exponential backoff on DB / handler errors
  - Graceful shutdown via SIGTERM / SIGINT
  - Structured JSON logging
"""

from __future__ import annotations

import io
import json
import logging
import math
import os
import signal
import sys
import time
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

import psycopg2
import psycopg2.extras

# ---------------------------------------------------------------------------
# Allow running as `python3 scripts/worker.py` from project root OR directly
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scripts.worker_db import get_connection, claim_job, update_job_status, insert_payment_log
from scripts.worker_storage import save_geojson, save_pdf_report

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
POLL_INTERVAL: int = int(os.getenv("WORKER_POLL_INTERVAL", "5"))
MAX_BACKOFF: int = int(os.getenv("WORKER_MAX_BACKOFF", "60"))
LOG_LEVEL: str = os.getenv("WORKER_LOG_LEVEL", "INFO").upper()

# ---------------------------------------------------------------------------
# Structured JSON logging
# ---------------------------------------------------------------------------

class _JsonFormatter(logging.Formatter):
    """Emit each log record as a single JSON line."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401
        log_entry: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Merge any extra dict passed via logging.info("msg", extra={...})
        if hasattr(record, "event"):
            log_entry["event"] = record.event  # type: ignore[attr-defined]
        for key in ("job_id", "job_type", "priority", "attempt", "path", "size_bytes",
                     "has_error", "payment_id", "from_status", "to_status"):
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)  # type: ignore[attr-defined]
        if record.exc_info and record.exc_info[1]:
            log_entry["error"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, default=str)


def _setup_logging() -> None:
    root = logging.getLogger("metardu.worker")
    root.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root.addHandler(handler)

    # Silence noisy third-party loggers
    logging.getLogger("redis").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


logger = logging.getLogger("metardu.worker")

# ---------------------------------------------------------------------------
# Graceful shutdown
# ---------------------------------------------------------------------------
_shutdown_requested = False


def _request_shutdown(signum: int, _frame: Any) -> None:
    global _shutdown_requested
    _shutdown_requested = True
    logger.info("shutdown_signalled", extra={"event": "shutdown_signalled", "signal": signum})


signal.signal(signal.SIGTERM, _request_shutdown)
signal.signal(signal.SIGINT, _request_shutdown)

# ---------------------------------------------------------------------------
# Redis (optional — used for distributed locking / pubsub later)
# ---------------------------------------------------------------------------

def _get_redis():
    """Return a Redis connection if REDIS_URL is set, else None."""
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None
    try:
        import redis as redis_lib
        return redis_lib.from_url(redis_url, decode_responses=True)
    except Exception:
        logger.warning("redis_unavailable", extra={"event": "redis_unavailable"})
        return None


# ---------------------------------------------------------------------------
# Job handlers
# ---------------------------------------------------------------------------

def handle_pdf_generation(conn: psycopg2.extensions.connection, job: dict) -> dict:
    """Generate a placeholder PDF report using reportlab.

    Payload expected: ``{"project_id": "<uuid>"}``
    """
    payload = job.get("payload", {})
    project_id = payload.get("project_id")

    # Fetch project name
    project_name = "Unknown Project"
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        if project_id:
            cur.execute("SELECT name FROM projects WHERE id = %s", (project_id,))
            row = cur.fetchone()
            if row:
                project_name = row["name"]

    # Generate PDF with reportlab
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    # Title
    c.setFont("Helvetica-Bold", 24)
    c.drawCentredString(width / 2, height - 60 * mm, "METARDU Survey Report")
    c.setFont("Helvetica", 14)
    c.drawCentredString(width / 2, height - 80 * mm, project_name)
    c.drawCentredString(width / 2, height - 95 * mm,
                        f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")

    # Footer
    c.setFont("Helvetica", 9)
    c.drawCentredString(width / 2, 20 * mm, f"Project ID: {project_id or 'N/A'}")
    c.drawCentredString(width / 2, 14 * mm, "This document was auto-generated by METARDU.")

    c.showPage()
    c.save()

    pdf_bytes = buf.getvalue()
    filename = f"report_{project_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
    file_path = save_pdf_report(pdf_bytes, filename)

    return {
        "status": "success",
        "file_path": file_path,
        "file_size": len(pdf_bytes),
        "project_id": project_id,
        "project_name": project_name,
    }


def handle_report_processing(conn: psycopg2.extensions.connection, job: dict) -> dict:
    """Query traverse results and build a summary JSON.

    Payload expected: ``{"project_id": "<uuid>"}``
    """
    payload = job.get("payload", {})
    project_id = payload.get("project_id")

    summary: dict[str, Any] = {
        "project_id": project_id,
        "station_count": 0,
        "precision_ratio": None,
        "area": None,
        "misclosure": None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        if project_id:
            # Count traverse stations
            cur.execute("""
                SELECT COUNT(*) AS station_count
                  FROM traverse_results
                 WHERE project_id = %s
            """, (project_id,))
            row = cur.fetchone()
            if row:
                summary["station_count"] = row["station_count"]

            # Precision ratio — pick the most recent completed traverse
            cur.execute("""
                SELECT precision_ratio, area_sqm, angular_misclosure, linear_misclosure
                  FROM traverse_results
                 WHERE project_id = %s
                   AND precision_ratio IS NOT NULL
              ORDER BY created_at DESC
                 LIMIT 1
            """, (project_id,))
            row = cur.fetchone()
            if row:
                summary["precision_ratio"] = float(row["precision_ratio"]) if row["precision_ratio"] else None
                summary["area"] = float(row["area_sqm"]) if row["area_sqm"] else None
                summary["misclosure"] = {
                    "angular_sec": float(row["angular_misclosure"]) if row["angular_misclosure"] else None,
                    "linear_m": float(row["linear_misclosure"]) if row["linear_misclosure"] else None,
                }

    return summary


def handle_payment_verification(conn: psycopg2.extensions.connection, job: dict) -> dict:
    """Verify a payment by checking its current status.

    Payload expected: ``{"payment_id": "<uuid>"}``
    """
    payload = job.get("payload", {})
    payment_id = payload.get("payment_id")

    result: dict[str, Any] = {
        "payment_id": payment_id,
        "verified": False,
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        if payment_id:
            cur.execute("""
                SELECT id, status, amount, currency, payment_method, transaction_id
                  FROM payment_history
                 WHERE id = %s
            """, (payment_id,))
            row = cur.fetchone()

            if row:
                result["db_status"] = row["status"]
                result["amount"] = float(row["amount"]) if row["amount"] else None
                result["currency"] = row["currency"]
                result["payment_method"] = row["payment_method"]
                result["transaction_id"] = row["transaction_id"]
                result["verified"] = row["status"] == "completed"

                # Insert audit log
                insert_payment_log(
                    conn,
                    payment_id=payment_id,
                    from_status=None,
                    to_status=row["status"],
                    event_type="verified",
                    provider=row["payment_method"],
                    provider_tx_id=row["transaction_id"],
                )
            else:
                result["error"] = "Payment record not found"

    return result


def handle_shapefile_generation(conn: psycopg2.extensions.connection, job: dict) -> dict:
    """Export survey points as a GeoJSON file.

    Payload expected: ``{"project_id": "<uuid>"}``
    """
    payload = job.get("payload", {})
    project_id = payload.get("project_id")

    features: list[dict] = []
    project_name = "Unknown Project"

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        if project_id:
            # Get project name
            cur.execute("SELECT name FROM projects WHERE id = %s", (project_id,))
            row = cur.fetchone()
            if row:
                project_name = row["name"]

            # Get survey points
            cur.execute("""
                SELECT id, point_name, easting, northing, elevation,
                       point_type, description, created_at
                  FROM survey_points
                 WHERE project_id = %s
              ORDER BY created_at ASC
            """, (project_id,))
            rows = cur.fetchall()

            for pt in rows:
                feature: dict[str, Any] = {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [
                            float(pt["easting"]) if pt["easting"] else 0.0,
                            float(pt["northing"]) if pt["northing"] else 0.0,
                        ],
                    },
                    "properties": {
                        "id": str(pt["id"]),
                        "name": pt["point_name"],
                        "elevation": float(pt["elevation"]) if pt["elevation"] else None,
                        "type": pt["point_type"],
                        "description": pt["description"],
                    },
                }
                if pt.get("elevation") is not None:
                    feature["geometry"]["coordinates"].append(float(pt["elevation"]))
                features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "name": f"{project_name} - Survey Points",
        "project_id": project_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "features": features,
    }

    filename = f"survey_points_{project_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}.geojson"
    file_path = save_geojson(geojson, filename)

    return {
        "status": "success",
        "file_path": file_path,
        "feature_count": len(features),
        "project_id": project_id,
        "project_name": project_name,
    }


# ---------------------------------------------------------------------------
# Handler dispatch table
# ---------------------------------------------------------------------------

HANDLERS: dict[str, Any] = {
    "pdf_generation": handle_pdf_generation,
    "report_processing": handle_report_processing,
    "payment_verification": handle_payment_verification,
    "shapefile_generation": handle_shapefile_generation,
}


# ---------------------------------------------------------------------------
# Main worker loop
# ---------------------------------------------------------------------------

def main() -> None:
    _setup_logging()
    logger.info("worker_starting", extra={
        "event": "worker_starting",
        "poll_interval": POLL_INTERVAL,
        "max_backoff": MAX_BACKOFF,
    })

    # Optionally ping Redis
    redis_conn = _get_redis()
    if redis_conn:
        try:
            redis_conn.ping()
            logger.info("redis_connected", extra={"event": "redis_connected"})
        except Exception:
            logger.warning("redis_ping_failed", extra={"event": "redis_ping_failed"})
            redis_conn = None

    # Ensure output dir exists
    from scripts.worker_storage import ensure_output_dir
    ensure_output_dir()

    backoff = 1.0  # current backoff seconds (doubles on error, resets on success)

    while not _shutdown_requested:
        conn = None
        try:
            conn = get_connection()
            job = claim_job(conn)

            if job is None:
                # No jobs — reset backoff and sleep
                backoff = 1.0
                time.sleep(POLL_INTERVAL)
                continue

            # Reset backoff after successful claim
            backoff = 1.0
            job_id = job["id"]
            job_type = job["job_type"]

            logger.info("job_starting", extra={
                "event": "job_starting",
                "job_id": str(job_id),
                "job_type": job_type,
            })

            handler = HANDLERS.get(job_type)
            if handler is None:
                raise ValueError(f"Unknown job type: {job_type}")

            result = handler(conn, job)

            update_job_status(conn, job_id, "completed", result=result)

            logger.info("job_completed", extra={
                "event": "job_completed",
                "job_id": str(job_id),
                "job_type": job_type,
            })

        except psycopg2.OperationalError:
            logger.error("db_connection_error", extra={"event": "db_connection_error"},
                         exc_info=True)
            backoff = min(backoff * 2, MAX_BACKOFF)
            logger.info("backoff", extra={"event": "backoff", "seconds": backoff})
            time.sleep(backoff)

        except Exception as exc:
            tb = traceback.format_exc()
            logger.error("job_failed", extra={
                "event": "job_failed",
                "job_id": str(job.get("id", "unknown")),
                "job_type": job.get("job_type", "unknown"),
                "error": str(exc),
            }, exc_info=True)

            # Try to mark the job as failed
            if conn and job:
                try:
                    update_job_status(conn, job["id"], "failed", error=str(exc))
                except Exception:
                    logger.error("failed_to_update_status", extra={"event": "failed_to_update_status"},
                                 exc_info=True)

            backoff = min(backoff * 2, MAX_BACKOFF)
            logger.info("backoff", extra={"event": "backoff", "seconds": backoff})
            time.sleep(backoff)

        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    # Graceful shutdown
    logger.info("worker_stopping", extra={"event": "worker_stopping"})


if __name__ == "__main__":
    main()
