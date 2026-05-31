"""
METARDU Python Compute Worker
FastAPI service for heavy survey computations.
Invoked by Next.js via callPythonCompute() from @/lib/pythonService.
"""

from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel
from typing import Optional, Any
from starlette.responses import JSONResponse
import hmac
import math
import json
import os

app = FastAPI(title="METARDU Compute Worker", version="0.1.0")

# --- Worker Secret: MUST be set via environment variable ---
WORKER_SECRET = os.environ.get("WORKER_SECRET", "")
if not WORKER_SECRET:
    # In development, allow a default. In production, this MUST be set.
    if os.environ.get("ENVIRONMENT", "production") == "development":
        WORKER_SECRET = "dev-worker-secret"
    else:
        print("[worker] WARNING: WORKER_SECRET not set — all compute requests will be rejected")

# --- Constants (Kenya Survey Regulations 1994) ---
LEVELLING_TOLERANCE_MM_PER_SQRTKM = 10  # 10√K mm — RDM 1.1 (2025) Table 5.1
ANGULAR_MISCLOSURE_COEFFICIENT = 15     # 15″√N seconds
LINEAR_MISCLOSURE_URBAN = 10000          # 1:10000
LINEAR_MISCLOSURE_RURAL = 5000           # 1:5000

# --- Task Registry ---
TASK_REGISTRY: dict[str, callable] = {}

def register_task(name: str):
    """Decorator to register a computation task."""
    def decorator(func):
        TASK_REGISTRY[name] = func
        return func
    return decorator

# --- Auth Middleware ---
@app.middleware("http")
async def verify_worker_secret(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    if not WORKER_SECRET:
        return JSONResponse(status_code=503, content={"detail": "Worker secret not configured"})
    secret = request.headers.get("X-Worker-Secret", "")
    # Use constant-time comparison to prevent timing attacks
    if not hmac.compare_digest(secret, WORKER_SECRET):
        return JSONResponse(status_code=403, content={"detail": "Invalid worker secret"})
    return await call_next(request)

# --- Models ---
class ComputeRequest(BaseModel):
    task: str
    params: dict[str, Any]

class ComputeResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None

# --- Health Check ---
@app.get("/health")
async def health():
    return {"status": "ok", "service": "metardu-compute-worker", "version": "0.1.0"}

# --- Task Dispatcher ---
@app.post("/compute")
async def compute(request: ComputeRequest):
    if request.task not in TASK_REGISTRY:
        available = list(TASK_REGISTRY.keys())
        return ComputeResponse(
            success=False,
            error=f"Unknown task: {request.task}. Available: {available}"
        )
    try:
        result = await TASK_REGISTRY[request.task](request.params)
        return ComputeResponse(success=True, data=result)
    except Exception as e:
        return ComputeResponse(success=False, error=str(e))

# --- List Tasks ---
@app.get("/tasks")
async def list_tasks():
    return {"tasks": list(TASK_REGISTRY.keys())}

# ============================================================
# REGISTERED COMPUTATION TASKS
# ============================================================

@register_task("bowditch_traverse")
async def bowditch_traverse(params: dict):
    """Bowditch Compass Rule traverse adjustment per Survey Regulations 1994."""
    observations = params.get("observations", [])
    start_e = params.get("start_easting", 0)
    start_n = params.get("start_northing", 0)
    close_e = params.get("closing_easting", None)
    close_n = params.get("closing_northing", None)
    n = len(observations)
    if n == 0:
        raise ValueError("No observations provided")

    total_dist = 0
    sum_dn = 0
    sum_de = 0
    legs = []

    curr_e, curr_n = start_e, start_n

    for i, obs in enumerate(observations):
        bearing_rad = math.radians(obs["bearing"])
        dist = obs["distance"]
        dn = dist * math.cos(bearing_rad)
        de = dist * math.sin(bearing_rad)

        total_dist += dist
        sum_dn += dn
        sum_de += de

        curr_n += dn
        curr_e += de

        legs.append({
            "from": obs.get("from", f"P{i}"),
            "to": obs.get("to", f"P{i+1}"),
            "distance": dist,
            "bearing": obs["bearing"],
            "raw_delta_n": dn,
            "raw_delta_e": de,
            "easting": curr_e,
            "northing": curr_n,
            "correction_n": 0,
            "correction_e": 0,
            "adj_easting": curr_e,
            "adj_northing": curr_n,
        })

    # Closing error
    error_n = (close_n - curr_n) if close_n is not None else -sum_dn
    error_e = (close_e - curr_e) if close_e is not None else -sum_de
    linear_error = math.sqrt(error_n**2 + error_e**2)
    precision = total_dist / linear_error if linear_error > 0 else float('inf')

    # Angular misclosure (if angles provided)
    angles = [obs.get("angle") for obs in observations if obs.get("angle") is not None]
    ea = 0
    if len(angles) == n:
        ea_deg = sum(angles) - (2 * n - 4) * 90
        ea = ea_deg * 3600  # convert to seconds
        tolerance_ea = ANGULAR_MISCLOSURE_COEFFICIENT * math.sqrt(n)

    # Bowditch corrections
    curr_e, curr_n = start_e, start_n
    for leg in legs:
        corr_n = -(error_n * leg["distance"] / total_dist) if total_dist > 0 else 0
        corr_e = -(error_e * leg["distance"] / total_dist) if total_dist > 0 else 0
        leg["correction_n"] = corr_n
        leg["correction_e"] = corr_e
        curr_n += leg["raw_delta_n"] + corr_n
        curr_e += leg["raw_delta_e"] + corr_e
        leg["adj_northing"] = curr_n
        leg["adj_easting"] = curr_e

    # Area via Shoelace
    area = 0
    adj_coords = [(leg["adj_easting"], leg["adj_northing"]) for leg in legs]
    for i in range(len(adj_coords)):
        j = (i + 1) % len(adj_coords)
        area += adj_coords[i][0] * adj_coords[j][1]
        area -= adj_coords[i][1] * adj_coords[j][0]
    area = abs(area) / 2

    return {
        "legs": legs,
        "closing_error_e": error_e,
        "closing_error_n": error_n,
        "linear_misclosure_m": linear_error,
        "precision_ratio": precision,
        "total_distance": total_dist,
        "area_sqm": area,
        "area_ha": area / 10000,
        "angular_misclosure_sec": ea if angles else None,
        "angular_tolerance_sec": ANGULAR_MISCLOSURE_COEFFICIENT * math.sqrt(n) if angles else None,
        "passes_urban": precision >= LINEAR_MISCLOSURE_URBAN,
        "passes_rural": precision >= LINEAR_MISCLOSURE_RURAL,
    }

@register_task("levelling_closure")
async def levelling_closure(params: dict):
    """Rise & Fall + Height of Collimation with 10√K mm closure check."""
    observations = params.get("observations", [])
    start_rl = params.get("start_rl", 0)
    close_rl = params.get("closing_rl", None)
    total_distance_m = params.get("total_distance_m", 0)

    K = total_distance_m / 1000  # km
    tolerance_mm = LEVELLING_TOLERANCE_MM_PER_SQRTKM * math.sqrt(K) if K > 0 else 0

    # Rise & Fall method
    current_rl = start_rl
    rf_results = []
    sum_bs = 0
    sum_fs = 0
    sum_rise = 0
    sum_fall = 0

    for obs in observations:
        bs = obs.get("backsight", 0)
        fs = obs.get("foresight", 0)
        rise = bs - fs
        fall = fs - bs

        if bs > 0: sum_bs += bs
        if fs > 0: sum_fs += fs

        if rise >= 0:
            sum_rise += rise
        else:
            sum_fall += abs(fall) if fall < 0 else 0

        current_rl += rise
        rf_results.append({
            "station": obs.get("station", ""),
            "bs": bs, "is": obs.get("intermediate", 0), "fs": fs,
            "rise": rise, "fall": fall,
            "rl": current_rl,
            "distance": obs.get("distance", 0),
        })

    last_rl = rf_results[-1]["rl"] if rf_results else start_rl
    check1 = sum_bs - sum_fs
    check2 = sum_rise - sum_fall
    check3 = last_rl - start_rl

    closure_mm = abs(last_rl - close_rl) * 1000 if close_rl is not None else 0
    passes = closure_mm <= tolerance_mm if close_rl is not None else True

    return {
        "method": "rise_fall",
        "results": rf_results,
        "sums": {
            "sum_bs": sum_bs, "sum_fs": sum_fs,
            "sum_rise": sum_rise, "sum_fall": sum_fall,
            "check_bs_minus_fs": check1,
            "check_rise_minus_fall": check2,
            "check_last_minus_first": check3,
            "arithmetic_agree": abs(check1 - check2) < 0.001 and abs(check2 - check3) < 0.001,
        },
        "closure_mm": closure_mm,
        "tolerance_mm": tolerance_mm,
        "passes": passes,
        "k_km": K,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
