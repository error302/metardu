# Native baseline acceptance

From `python_worker/`, run:

```sh
python -B -m unittest discover -s native_tests -v
```

Install the RTKLIB CLI first. Missing `rnx2rtkp` is a test failure, with no skip
or fake-runner fallback. The existing Python worker CI job installs RTKLIB on
Ubuntu 24.04 and runs this command after its ordinary pytest suite. No solver,
ephemeris or reference download occurs during these five native tests.

The suite executes the real checkout baseline wrapper and native subprocess. It
requires a FIX result, FLOAT with ambiguity resolution disabled, a changed rover
result when the supplied base changes, rejection of actual SINGLE output, and
rejection of native invalid-setting diagnostics even if FIX rows accompany exit 0.
Native processes have time/CPU/memory/file-size limits and use owned temporary
directories with a minimal environment. It imports no application, database,
worker router or cache. It is suitable for host/CI validation of a candidate;
it does not deploy a worker or establish normal-account HTTP/field acceptance.

`data/` contains only three public observation/navigation files from
[RTKLIB's native test inputs](https://github.com/tomojitakasu/RTKLIB/blob/71db0ffa0d9735697c6adfd06fdf766d0e5ce807/app/rnx2rtkp/gcc/makefile),
pinned to revision `71db0ffa0d9735697c6adfd06fdf766d0e5ce807`. Their headers
identify GSI, Japan and observations from 2 April 2005. These are reference test
data, not METARDU customer observations. File sizes, exact SHA-256 values and
upstream URLs are in `data/reference.json`; the suite checks the bytes before
solving. Git attributes preserve the RINEX bytes across checkout platforms.

The same upstream makefile supplies base ECEF
(-3978241.958, 3382840.234, 3649900.853) m. Stored base latitude/longitude and
ellipsoidal height were derived offline with pyproj 3.7.2 / PROJ 9.5.1 under
RTKLIB's WGS84 convention. The second control is a synthetic +1 m ECEF X change.
Numerical rover expectations come from the controlled native run documented in
[GNSS native acceptance](../../docs/GNSS_NATIVE_ACCEPTANCE_2026-10-22.md).

Coordinate tolerances are regression bounds across distribution builds. They
are not independently surveyed truth or an accuracy specification. FIX/FLOAT,
fitted sigma and ambiguity ratio do not certify field accuracy. This small GPS
RINEX2 case does not cover receiver diversity, multi-constellation, L5,
antenna/epoch/vertical-reference suitability or long/large field workloads.
