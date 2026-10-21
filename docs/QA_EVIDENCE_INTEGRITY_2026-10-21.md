# QA evidence integrity and full source-suite checkpoint

## Reproduced failures

The ordinary Jest baseline ran with native database probes disabled, private
dotenv values excluded, and synthetic auth/database configuration. Its 2,903-file
source/config fingerprint and HEAD were unchanged throughout the run. It passed
5,364 tests, failed three, and skipped nine (593 passed suites, three failed and
three skipped). The first interrupted launcher attempt used an invalid empty
NextAuth URL; its output was retained separately and is not this baseline.

The three baseline failures were an obsolete document-review copy expectation,
a legacy project-map route expected to own a separate selection implementation,
and a plan-label assertion checking unescaped characters in SVG source. The
shared map redirect and licensed-surveyor review gates remain intact. The plan
test now parses SVG and checks decoded text labels, including bearings and metre
units, rather than matching attribute/source quoting. Existing unrelated
multi-sheet renderer edits are preserved; only the separate label assertion
hunk belongs to this remediation.

Independent review also found real QA defects beyond those failing assertions:

- The area cache used only the first vertex. Changing other vertices could retain
  the old area and falsely pass reconciliation. Adjacent parcels sharing that
  first corner could reuse each other's area.
- Area verdicts lacked a recorded numerical difference, tolerance and units.
- A declared-looking CRS string could authorize spatial checks without passing
  the shared projected-metre CRS authority.
- Delayed HTTP save results checked only the project ID. An older result could
  mark changed inputs as saved, or replace a newer successful save with failure.

## Final source behavior

Area calculation remains in the established engine. The bounded cache key now
includes the complete geometry. Reported reconciliation records contain the
absolute area difference, the existing 0.001 ha tolerance, hectare units and the
`lte` comparison. This records the existing rule; it does not certify its
applicability to a particular survey. Invalid, geographic, display-only and
unknown CRS declarations leave spatial checks pending.

Save status is bound to both the current project/input snapshot and the complete
result fingerprint. Changing inputs immediately invalidates the old status;
changed topology verdicts also require their own save. Repeated checks with the
same inputs and verdicts can share an in-flight request. Leaving the dashboard
prevents unfinished checks from starting an evidence write. Existing checks stay
visible if persistence fails. Records remain reported QA evidence, with document
and registry review pending; they do not establish field or legal acceptance.

## Verification

- `.cache/qa-evidence-red.log`: eight failing regression cases, including a false
  area PASS and both directions of the stale-response status race.
- `.cache/platform-remediation-final-tests.log`: 100 checks pass across five
  affected suites, including XML label parsing and server QA ownership checks.
- `.cache/platform-remediation-types.log`, `platform-remediation-lint.log` and
  `platform-remediation-security.log`: strict app/test typing, scoped lint and the
  security gate pass; 119 applied SQL files remain pinned.
- `.cache/platform-suite-baseline.log`, `platform-suite-baseline-results.json`
  and `platform-suite-baseline-inventory.json` retain the broad baseline.
- The final ordinary Jest run passes **5,379 tests across 597 executed suites**,
  with nine tests skipped and zero failures (600 suites in total). It finished
  normally in 450.774 seconds. Evidence is `.cache/platform-suite.log`,
  `platform-suite-results.json` and `platform-suite-inventory.json`.
- HEAD, working-tree status and the 2,904-file source/config fingerprint stayed
  unchanged during that final run. Fingerprint:
  `1dc6c3e909656f21b964fb6a84f10487fe87ebcd03490322a8dedc2aa9ca4117`.
  This is the current working tree, including existing uncommitted survey-plan
  work; it is not a test of an isolated release image or a claim that those
  unrelated changes were committed here.
- The skipped checks are the native runtime-role membership case, field-sync
  rollback, six PostgreSQL account-linking cases and native observation upgrade.
  The expected `verify-migrations: FAIL` diagnostic comes from a negative unit
  fixture with no configured database, not from a production migration attempt.
- `.cache/platform-remediation-runtime.log` confirms the existing app and
  supporting services healthy/running, matching-image migration bootstrap
  complete and HTTP/database/Redis checks passing after the source run.

These are source tests using real calculation helpers and controlled transport/
topology fixtures. They do not establish native PostgreSQL, browser, hardware,
measured field, provider/payment or production-release acceptance. Full CI
coverage thresholds, Python-worker tests and the non-Jest release checks were
not run by this ordinary Jest command. The existing
production stack remains healthy on its prior artifact; no image, service, SQL,
credential or customer data was changed. The existing synthetic database is still
stopped, awaiting the separate approval in `FIELDBOOK_NATIVE_ACCEPTANCE.md`.
