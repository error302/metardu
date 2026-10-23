# Leveling reduction and closure evidence — 23 October 2026

This checkpoint covers source behavior. The broader production goal remains
active; these repairs have not been promoted to the existing production stack.

## Verified defects

The active `/api/compute/leveling` endpoint estimated kilometres from the number
of backsights. It ignored a caller's supplied run length and reported missing
closing control as an excessive zero closure. Its schema admitted empty runs,
blank stations and rows without readings. Finite but extreme inputs could
overflow inside the engine and serialize as misleading JSON null results.
The initial real-wrapper/engine regression run reproduced 16 failures while
the anonymous and basic malformed-JSON controls continued to pass.

The public leveling calculator supplied an opening RL of 100 m, a distance of
1 km and populated readings before any user entry. Empty/zero lengths fell back
to 1 km. Results, copied summaries and PDF arguments treated missing closure as
failure. Editing input left the old result and exports available. Four rendered
component regressions reproduced those states.

The uploaded-notes path similarly substituted opening RL 100 m, assigned a
one-kilometre worked explanation, and estimated tolerance distance from row
count. It displayed misclosure as the arithmetic residual. The shared tolerance
checker could mark a run complete without known closing control or length.
The new processing/tolerance tests reproduced seven failures with three controls
passing before repair.

The CSV interpreter also selected only one value from a leveling row, dropping
either FS or BS at a combined turning point. Lowercase headings could produce
coordinate observations, malformed numeric suffixes were truncated, and missing
sights/names became zero/generated station values. Eight independent parser
regressions reproduced these failures.

## Resulting source behavior

- API reduction still uses the established rise-and-fall/HOC engines and the
  existing authenticated, rate-limited wrapper. It accepts an optional positive
  finite `distanceKm`; observation count supplies no length. Unknown closure,
  tolerance or acceptance is explicitly null with `closureStatus: unknown`.
  A supplied closing benchmark of zero is valid. A failed arithmetic identity
  prevents a closure verdict even if the final RL happens to match the closing
  benchmark. Nonfinite outputs return HTTP 422. Transport bounds are 10,000 rows
  and 200 characters per station. No stored observation or engine arithmetic was
  rewritten by this response-contract repair.
- The shared closure presentation retains the actual measured residual when
  only run length is missing. A 10√K mm result is explicitly a numerical
  reference, not adopted project criteria, field verification or approval.
- The public calculator begins with blank benchmark, length and readings. It
  validates through the same working-book adapter, preserves entered zero,
  clears stale results/steps/export controls on edits, and retains unknown
  closure in copied output and PDF summary arguments. Observation-table columns
  remain aligned before and after calculation. The ordinal profile no longer
  replaces an adjusted zero or divides by zero for a single plotted station.
- Uploaded leveling notes require an explicitly entered opening benchmark.
  Closing control and measured run length remain optional, with an incomplete
  assessment when absent. A newly uploaded source clears previous setup and
  results. The workflow's arithmetic residual is calculated from its actual
  engine readings separately from benchmark misclosure.
- CSV leveling rows retain every supplied BS/IS/FS sight together. Case-insensitive
  sight headings and actual zero work; incomplete or malformed input is refused
  without a fabricated reading/station. Duplicate sight headings and quoted or
  uneven CSV rows currently return an explicit limitation instead of silently
  selecting or dropping content. The original uploaded source text stays in the
  page; this numeric interpretation is not an archival format or proof of raw
  source provenance. Other survey-type CSV parsing remains a separate audit.
- Worked explanations preserve unknown length and omit an unassessable closure
  verdict rather than substituting a one-kilometre given. The tolerance contract
  represents missing closing error/run length explicitly and marks the complete
  assessment false while retaining available arithmetic checks.

The independent fixtures include a 4 mm closing difference over a declared 1 km
run (10 mm numerical reference), zero/negative benchmark values, and a turning
point with FS 1.25 m and BS 0.75 m. From opening RL 100 m and BS 1.5 m, its final
FS 0.8 m yields RL 100.2 m. The parser-to-page regression verifies both turning
point sights and that final value without mocking the parser or calculation.

## Verification and runtime boundaries

The initial related source run passed 144 tests across 17 suites. It uses real API
validation/wrapping and the actual engines, with infrastructure/session stubs;
this is not a network or real-login test. Rendering tests exercise calculator
and processing forms and inspect exported PDF arguments. They do not inspect a
new native PDF, clipboard permission, physical print or instrument.

The final focused source run passes 96 tests across ten suites, covering the
API, calculator, processing page, CSV fidelity, closure contract, numerical
evidence, both engine standards suites, tolerance checks and workflow engine.
The selections differ from the earlier run; these are not additive unique-test
counts. Application and test TypeScript projects pass. Source checks do not
establish that every platform calculation has been accepted. Final changed-file
ESLint exits zero with no errors and one pre-existing `no-console` warning in
the shared PDF helper's export-failure diagnostic. The source security gate
passes with all 119 pinned applied migration hashes intact.

## Native HTTP and exact cleanup

Earlier approval-connection failures prevented the first HTTP attempt and
cleanup; those pending states have now been superseded. The ordinary CSRF and
credential sign-in verifier completed all 11 checks at 10:05 UTC on 23 October.
It verifies anonymous refusal, unknown closure/length, actual 4 mm/1 km results
for both methods, zero, arithmetic failure, malformed input and nonfinite
refusal while preserving retained books, captures, batches and migrations.
`.cache/fieldbook-delivery/leveling-http.json` retains the receipt. The tested
API/runner source hashes were rechecked against the working source during this
integration review; they match.

The independent 10:13 UTC post-check confirms seven retained table fingerprints,
unchanged ordinary role, suspended synthetic account and removal of its temporary
credential file. See `.cache/online-transform-http-postcheck.json` and
`BACKUP_FRESHNESS_2026-10-23.md`. No account was reactivated for the public
calculator review, and no production authentication setting was changed.

## Browser and paper findings

CUA used a separate owned tab on `http://127.0.0.1:3021/tools/leveling`, preserving
the existing map/drawing work. Blank initial setup, BS 1.5 m / FS 1.496 m with
opening RL 100 m, unknown closure, stale-result removal on edits and the supplied
closing RL 100 m / length 1 km were observed through ordinary UI interactions.
The latter produces raw RL 100.0040 m, adjusted RL 100.0000 m and the 4 mm versus
10 mm numerical reference. This is a synthetic public-calculator check, not a
new authenticated uploaded-notes or field exercise.

That real browser check exposed a further worked-answer defect: 4 mm rounded to
`0.00 m`. Positive and negative 4 mm regressions failed before changing the
leveling wrapper to the existing four-decimal delta formatter. Both now pass,
and the browser final worked answer shows `0.0040 m`.

Actual PDF download and PDF.js rendering exposed an unsupported square-root
glyph and an evidence sentence extending off the page. The leveling PDF now
uses `10 x sqrt(K)` notation. The existing shared computation-PDF helper wraps
summary labels and values within their columns and continues long rows across
pages. A maintained actual-jsPDF/PDF.js regression failed before the repair;
it now verifies multiple pages, text bounds, the complete final evidence marker
and a retained zero observation. This is one native artifact test, with no
browser/result-generator mocks. CI invokes it after dependency installation;
remote CI has not been run here.

A fresh browser download was rendered and visually inspected: all statement
text, the unknown status and the original numerical observations are retained.
The one-page PDF SHA-256 is
`3d92262912f1e5e93a3842d4d2b6a117acbae5d0cc1c2949432c548d7d834b3e`.
Its text/render receipt is `.cache/leveling-review/pdf-check.json`; before/after
PDFs and page images remain in that same owned evidence directory. This checks
one small synthetic report, not every report family or physical print.

The calculator table now has explicit column spacing and an inner horizontal
scroll area. At a 390 x 844 mobile override, the observed page scroll width
equals its 380 px client width while the 768 px table scrolls within its 346 px
container. The temporary viewport override was reset. Screenshots are
`.cache/leveling-review/declared-closure.png` and `mobile-closure.png`.

## Remaining acceptance

Fresh read-only Docker verification passes for the single existing application
and required services. Backup completion is now 23 October 10:25:43 UTC;
archive/header evidence and the earlier synthetic restore remain separate from
customer/uploads/offsite recovery. No application/worker was promoted, no
migration was applied and no production service was changed by this source work.

Adopted project criteria, vertical-control identity/revision, physical receiver
and field evidence, ordinary uploaded-notes browser acceptance, long/wider report
families, physical printing, Linux/PWA candidate checks and coordinated release
remain open. Deferred signing-key rotation remains unchanged. The broader
engineering and commercial goal is still active.
