# GNSS RTKLIB baseline repair — 12 October 2026

## What was wrong

The baseline worker passed `-k` four `key=value` strings even though RTKLIB uses
`-k` to name a configuration file. It also put the base observation file before
the rover file, used `pos1-armode` instead of `pos2-armode`, and exposed
frequency/ambiguity labels that do not match RTKLIB's supported choices. The
`.pos` parser read the ambiguity ratio from the wrong column and could return
single-point or unknown-quality output as if it were a baseline.

RTKLIB's [official 2.4.2 manual](https://www.rtklib.com/prog/manual_2.4.2.pdf)
documents the key/value configuration file and the `pos2-armode` and antenna
position settings. Its [RNX2RTKP manual](https://rtklib.com/prog/manual_2.4.0.pdf)
specifies rover observations first, reference/base observations second, then
navigation data.

## Source change

- The worker writes a temporary RTKLIB configuration file, supplies it after
  `-k`, and calls RTKLIB with rover OBS, base OBS, and NAV in that order.
- The worker image's explicit source copy list includes the extracted baseline
  processor module, so the next planned worker build can import it.
- The API and interface require the known base mark's geographic latitude,
  longitude, and ellipsoidal height. The worker explicitly sets that coordinate
  as the reference position. The tool does not transform a datum, coordinate
  epoch, projected grid, or orthometric height.
- Frequency choices now map to RTKLIB's L1, L1+L2, and L1+L2+L5 options.
  Ambiguity choices now match RTKLIB's off, continuous, instantaneous, and
  fix-and-hold modes.
- Files are limited to 25 MiB each at both client and API boundaries. RTKLIB
  runs in a worker thread with its existing 300-second process timeout.
- Only FIX or FLOAT relative solutions are returned. Coordinates, reported
  uncertainties, satellite count, and ambiguity ratio are range-checked; the
  ratio is read from the documented standard LLH solution row.

## Verification and remaining release gate

The new Python boundary tests use a controlled fake `rnx2rtkp` subprocess and
synthetic `.pos` rows. They prove configuration generation, rover/base ordering,
known-base handling, timeout wiring, ratio parsing, and refusal of invalid or
non-relative results. They do **not** prove numerical RTKLIB behavior or
survey-grade accuracy. The focused Python suite passed 11/11 tests. The client
suite passed 5/5 tests, including file-size limits and invalid-quality results.

The strict application and test-project TypeScript checks passed. No production
container was rebuilt, restarted, or changed.

Before this workflow can be accepted for field use, verify it with a supported
RTKLIB binary and representative rover/base/navigation RINEX from a known
control point. Record the control source and reference frame/epoch, antenna
types and measured heights, overlapping epochs, expected solution, observed
FIX/FLOAT status, residuals/ratio, and independently checked coordinate error.
Test no-overlap, bad-RINEX, timeout, and float-only cases as well. Keep those
results distinct from mocked subprocess tests and synthetic browser checks.
