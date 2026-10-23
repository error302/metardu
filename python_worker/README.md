# METARDU Python Compute Worker

FastAPI service for heavy survey computations. Invoked by Next.js through
`callPythonCompute()` (`src/lib/compute/pythonService.ts`) with the
`PYTHON_COMPUTE_URL` + `WORKER_SECRET` pair (docker-compose wires both
automatically inside the compose network).

## Application/worker compatibility

`/health` reports liveness only. The authenticated, non-cacheable
`GET /capabilities` endpoint reports versioned baseline and LAS/LAZ task
contracts from `compute-contract.json`. The application checks these before
submitting those tasks, sends the selected contract in its `/compute` envelope,
and requires the successful response to name the same task and contract.
An older healthy worker is therefore unavailable for these newer operations;
it cannot silently stand in for the corrected implementation. Other callers
also require an explicit success envelope and a non-null result. These are
compatibility checks, not certification of numerical accuracy or field suitability.

The default Docker runtime target depends on an acceptance stage. It executes
the source/ASGI HTTP tests and the native RTKLIB reference suite using the actual
Linux runtime dependencies. Test tooling, fixtures, caches and logs stay outside
the final runtime stage. `worker-build-acceptance.json` records the successful
build checks; actual authenticated application routes, field controls and a
reviewed production promotion still require separate acceptance.

For a planned release, `METARDU_WORKER_IMAGE` selects an explicit worker image
(default `metardu-metardu-worker:latest`). Prepare the reusable `candidate` tag
and inspect/protect the exact existing worker rollback image alongside the app.
Follow `docs/DOCKER_RUNTIME_WORKFLOW.md`; building this image does not authorize
blind compose promotion, changing customer migrations or replacing live services.

## Registered tasks

| Task | Purpose |
|------|---------|
| `bowditch_traverse` | Bowditch compass-rule traverse adjustment (Survey Regulations 1994) |
| `levelling_closure` | Rise & fall levelling with 10√K mm closure check |
| `gnss_baseline_process` | RTKLIB (rnx2rtkp) survey-grade baseline processing |
| `gnss_process_rinex` | **Real SPP processing of a RINEX observation file** (see below) |
| `gnss_process_rinex_multi` | Multi-station SPP + pairwise differential-SPP baselines |
| `parse_lidar` | LAS/LAZ header, CRS, classification, and bounded 100,000-point preview |

### LAS/LAZ import

`parse_lidar` uses laspy with the `lazrs` backend in this isolated worker. The
web endpoint accepts authenticated uploads up to 32 MiB and returns at most
100,000 points. Its response distinguishes `processedPoints` from the file's
`totalPoints` and sets `truncated`; METARDU disables terrain analyses when the
preview is partial. Embedded CRS metadata is reported but coordinates are not
reprojected. Missing CRS stays unknown, and any embedded CRS that is not a
projected metre CRS blocks slope/TIN/volume calculations until the source is
reprojected. Compressed waveform point formats are not supported by `lazrs`.

### OSM reference data

The interactive map's nearby context route uses the worker's Overpass-backed
`/osm/context-geojson` endpoint. It depends on `OSMPythonTools`, `osm2geojson`,
network access to public Overpass instances, and their availability and usage
limits. It provides community-mapped context only; it is not authoritative
survey evidence, and METARDU must retain the applicable OpenStreetMap
attribution.

The separate `/osm/features` and `/osm/stream-extract` routes use a local OSM
PBF extract. They are optional and are not provisioned by the base worker
image: `pyrosm` and `pyosmium` are not in `requirements.txt`, and no PBF file
is bundled. Configure the package, storage/memory budget, `OSM_PBF_PATH`, and
an update/attribution process before enabling them. Until then, these routes
return `503 Service Unavailable` rather than a successful empty dataset.
The stream extractor currently keeps selected features in memory before it
writes GeoJSON; do not enable broad or country-scale extraction until bounded
output streaming, geometry validation, and resource limits are implemented.

## GNSS SPP engine (`gnss_processor.py`)

A genuine code-based positioning engine — every number it returns is
computed from the observations and ephemerides (audit C9: the old
fabricated-satellite fallbacks are gone; missing ephemerides are a hard,
actionable error).

Capabilities:

- **RINEX 2.10–2.11 and 3.0x observation parsing** — pure Python, tolerant
  of real-world encoder quirks (teqc's concatenated satellite lists,
  sbf2rin's >250-char lines and 15-char values that break fixed-width
  parsers, gzip and Hatanaka inputs via `crx2rnx` when installed).
- **RINEX 2/3 navigation parsing** — GPS + Galileo broadcast ephemerides.
  GLONASS and BeiDou are skipped with an explicit warning (their time
  systems need dedicated models that are not implemented — pretending
  otherwise would be dishonest math).
- **IS-GPS-200 satellite positions** — Kepler solver, harmonic
  corrections, satellite clocks with relativistic and TGD/BGD group-delay
  terms, Sagnac rotation to the reception frame.
- **SP3 precise ephemeris** — orbits + clocks, 9-point Lagrange
  interpolation, extrapolation limited to a 10 s edge margin (transmission
  times precede reception by <0.1 s; the polynomial error is sub-mm).
  Beyond that margin: honest failure.
- **Multi-epoch WLS SPP** — per-system receiver clocks (GPS + Galileo),
  dual-frequency ionosphere-free combination when L1+L2/L5 code exist,
  Klobuchar ionosphere for single-frequency, Saastamoinen troposphere,
  elevation-dependent weighting, Bancroft closed-form cold start, and
  two-stage outlier rejection (20σ a-priori, then 3.5× variance factor).
- **Ephemeris auto-acquisition** — no nav file needed: the daily BRDC
  broadcast file is fetched from BKG's anonymous IGS mirror; IGS SP3
  final/rapid/ultra-rapid products come from the NOAA CORS mirror. All
  downloads are cached in-process (6 h TTL) and fail honestly.

Honest labelling — the `method` field is one of:

| Method | Meaning | Typical 95 % accuracy |
|--------|---------|----------------------|
| `SPP` | single-frequency code, broadcast ephemeris | 3–10 m horizontal |
| `SPP-IF` | dual-frequency ionosphere-free code, broadcast | 2–6 m |
| `SPP-SP3` | code with IGS precise orbits & clocks | 0.5–2 m |

PPP (carrier-phase, sub-decimetre) is **not implemented and never claimed**.
Survey-grade baselines should use the RTKLIB task (`gnss_baseline_process`).

### Validation (29 pytest tests — `python_worker/tests/`)

- RINEX 2 parsing validated against **georinex** (an independent parser):
  1,182 code-range values on real NOAA CORS data match exactly.
- Broadcast satellite positions validated against **IGS final SP3 orbits**
  (independent truth): median 1.7 m 3D agreement over 23 satellites.
- The solver is proven by **closed-loop synthesis**: noise-free
  pseudoranges generated from a known position (through the same
  IS-GPS-200 physics) are recovered to **< 1 mm** through the full
  parse → select → WLS → aggregate pipeline, in both RINEX 2 and 3.
- Real-data smoke tests: station positions agree with published CORS
  coordinates within honest SPP quality (e.g. 2.6 m at 1LSU).
- Failure paths stay honest: no ephemeris → hard error; garbage input →
  actionable message; nothing is ever fabricated.

Run the suite:

```bash
cd python_worker
pip install pytest numpy requests
python -m pytest tests/ -v          # offline suite (CI runs this)
python -m pytest tests/ -v --run-network   # + live ephemeris download tests
```

## Deployment

Built by `python_worker/Dockerfile` (python:3.11-slim + rtklib); run via
docker-compose (`metardu-worker`, port 8000 exposed only inside the
network). Auth: every request must carry `X-Worker-Secret` matching the
container's `WORKER_SECRET`.
