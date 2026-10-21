# GNSS baseline result integrity

## Reproduced defects

The RINEX panel kept its completed result when base coordinates or processing
settings changed. A file change cleared the displayed result, but an older
pending response could restore it and invoke `onPositionComputed`. Leaving the
panel also allowed a pending request to invoke that callback. The client checked
measurement ranges but accepted another base/settings record in response metadata.
The server trusted the worker's success envelope without validating measurements.

New regression tests reproduced **29 failures with seven existing/positive tests
passing** before remediation. They exercised real component events, deferred
client promises and the server handler with a mocked worker boundary.

## Source behavior

Every file, base-control and processing-setting edit invalidates the displayed
result and advances an input revision. Responses and errors are accepted only
for the current revision while the panel is mounted. Changing away and back does
not revive an older request. A single outstanding request holds the processing
button until it settles; edited inputs remain available, and the status explains
that the old result will be discarded. The operator can then process the current
inputs. An already delivered position remains the prior calculation snapshot;
this change prevents late publication rather than retracting earlier callbacks.

The API and client share a measurement schema: finite geographic coordinates and
height, nonnegative reported standard deviations and ambiguity ratio, a positive
integer satellite count, and only `FIX` or `FLOAT`. Invalid worker successes become
HTTP 502 `INVALID_WORKER_RESULT`; ordinary worker failures retain their error
status. Valid zero coordinates/heights and float results are preserved. Unrelated
worker output, including raw debug output, is omitted from the returned baseline.

The client also requires metadata to match the submitted base latitude, longitude,
ellipsoidal height, mode, frequency, elevation mask and ambiguity setting. It
requires the expected processor label and a readable processing timestamp. This
is request/response consistency, not a worker attestation: the API's metadata
echoes its request. It does not prove that a stale worker used those options or
bind returned measurements cryptographically to source files. The worker artifact
gap in [worker acceptance](WORKER_ACCEPTANCE_2026-10-21.md) remains a release gate.

## Verification and limits

- **65 tests pass across seven suites**: panel lifecycle/input races, client
  response validation, API worker validation, GNSS page, compute bridge,
  coordinate baseline engine and geodesy. The new panel/client/API suites account
  for 39 of these tests. API tests mock the wrapper and worker; they preserve
  the route's auth requirement but are not live authentication/database proof.
- Strict app/test TypeScript checks, scoped lint and the security gate pass;
  no migration source or applied ledger was changed.
- Read-only production verification confirms all required services healthy,
  with backup running, app/migrator artifact agreement and no duplicate app.
  Backup completion `2026-10-21T12:33:15Z` is archive/header evidence, not restore.
- CUA reached `/tools/gnss` on the existing owned `127.0.0.1:3021` source preview,
  selected RINEX mode and observed blank control/file inputs and a disabled
  processing button. The partial screenshot is layout-only evidence. No files
  were uploaded, compute request sent, browser storage written or CAD drawing
  touched. Delayed-response behavior is component evidence, not browser proof.
- No host `rnx2rtkp` executable was found. WSL inventory showed only
  `docker-desktop` running; the existing stopped Kali distribution was not started.
  This does not establish whether that stopped distribution has a solver.

Local ignored evidence: `.cache/gnss-integrity-red.log`,
`gnss-integrity-final-tests.log`, `gnss-integrity-types.log`,
`gnss-integrity-final-test-types.log`, `gnss-integrity-lint.log`,
`gnss-integrity-security.log`, `gnss-acceptance-runtime.log`,
and `gnss-source-form.jpg`.

No mathematical solver was changed, production artifact promoted, schema migrated,
native baseline solved, independent control comparison completed, or field result
verified. Current source still needs the reviewed worker/application release,
real solver/receiver/control acceptance and the wider migration, recovery,
paid/provider and device/field gates.
