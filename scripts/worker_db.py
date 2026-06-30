#!/usr/bin/env python3
"""METARDU Worker — Shared database helpers.

Provides:
  - get_connection(): Obtain a psycopg2 connection from DATABASE_URL.
  - claim_job(conn): Atomically claim the next pending background_job.
  - update_job_status(conn, job_id, status, result, error): Update a job row.
  - insert_payment_log(conn, ...): Insert an audit row into payment_logs.
"""

from __future__ import annotations

import os
import json
import uuid
import logging
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

logger = logging.getLogger("metardu.worker.db")


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

def get_connection() -> psycopg2.extensions.connection:
    """Return a new psycopg2 connection using DATABASE_URL.

    The caller is responsible for closing / returning the connection to a pool.
    """
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    # Register jsonb/uuid adapters
    psycopg2.extras.register_default_json(conn)
    psycopg2.extras.register_default_jsonb(conn)
    psycopg2.extras.register_uuid(conn)
    return conn


# ---------------------------------------------------------------------------
# Job claim (SELECT FOR UPDATE SKIP LOCKED)
# ---------------------------------------------------------------------------

def claim_job(conn: psycopg2.extensions.connection) -> dict | None:
    """Atomically claim the highest-priority pending job.

    Uses ``SELECT … FOR UPDATE SKIP LOCKED`` so multiple worker processes
    can run concurrently without race conditions.

    Returns the claimed job dict, or ``None`` when no jobs are available.
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        # 1. Grab next eligible row
        cur.execute("""
            SELECT id, job_type, payload, priority, attempts, max_attempts
              FROM background_jobs
             WHERE status = 'pending'
               AND attempts < max_attempts
          ORDER BY priority DESC, created_at ASC
             LIMIT 1
               FOR UPDATE SKIP LOCKED
        """)
        row = cur.fetchone()
        if row is None:
            conn.rollback()
            return None

        job_id = row["id"]

        # 2. Transition to 'running'
        cur.execute("""
            UPDATE background_jobs
               SET status      = 'running',
                   started_at  = NOW(),
                   attempts    = attempts + 1,
                   updated_at  = NOW()
             WHERE id = %s
        """, (job_id,))

    conn.commit()
    logger.info("claimed_job", extra={
        "event": "job_claimed",
        "job_id": str(job_id),
        "job_type": row["job_type"],
        "priority": row["priority"],
        "attempt": row["attempts"] + 1,
    })
    return dict(row)


# ---------------------------------------------------------------------------
# Job status update
# ---------------------------------------------------------------------------

def update_job_status(
    conn: psycopg2.extensions.connection,
    job_id: uuid.UUID,
    status: str,
    result: dict | None = None,
    error: str | None = None,
) -> None:
    """Update a background_job row's status, result, and/or error."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE background_jobs
               SET status        = %s,
                   result        = %s,
                   error_message = %s,
                   completed_at  = CASE WHEN %s IN ('completed','failed') THEN NOW() ELSE completed_at END,
                   updated_at    = NOW()
             WHERE id = %s
        """, (status, json.dumps(result) if result else None, error, status, job_id))
    conn.commit()
    logger.info("update_job_status", extra={
        "event": "job_status_updated",
        "job_id": str(job_id),
        "status": status,
        "has_error": error is not None,
    })


# ---------------------------------------------------------------------------
# Payment audit log
# ---------------------------------------------------------------------------

def insert_payment_log(
    conn: psycopg2.extensions.connection,
    payment_id: uuid.UUID,
    from_status: str | None,
    to_status: str | None,
    event_type: str,
    provider: str | None = None,
    provider_tx_id: str | None = None,
) -> None:
    """Insert a row into payment_logs for audit trail."""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO payment_logs (payment_id, from_status, to_status, event_type, provider, provider_tx_id)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (payment_id, from_status, to_status, event_type, provider, provider_tx_id))
    conn.commit()
    logger.info("insert_payment_log", extra={
        "event": "payment_log_inserted",
        "payment_id": str(payment_id),
        "event_type": event_type,
        "from_status": from_status,
        "to_status": to_status,
    })
