# Native CI contract and mobile preservation repair

## Failures reproduced and corrected

The design/set-out verifier applied migration 096 (version-1 capture shape) and
then invoked the current version-2 capture writer. Its native PostgreSQL insert
failed `setout_capture_snapshot_shape`. The fixture now also applies the existing,
unchanged migration 106 and supplies explicitly synthetic adopted criteria and
independent H/V uncertainty for 99 observations. A hundredth capture has no adopted
criteria and must remain INFO with null thresholds and explicit missing evidence.
All 103 saved observation identities, including three legacy observations, must
survive the report. No production writer or historical migration was changed.

The verifier can run on the existing exact-ID, purpose-marked loopback rehearsal
service; it does not accept arbitrary database overrides or deployment credentials.
CI uses a separate fixed fixture selected by `--ci`, which requires `CI=true`.
The owned local revision schemas are retained as synthetic evidence, not customer
data. This does not prove production migration or backup restoration.

The surface preflight posted an obsolete body without mandatory request identity,
selected point IDs or reviewed source/reference hashes. It therefore stopped at
body validation before its intended undeclared-CRS assertion. Its fixture now
records explicit point coordinate/height references and submits the current wire
contract. The real API wrapper, restricted PostgreSQL role and RLS remain active;
only provider session lookup is substituted with synthetic sessions.

Twenty native surface checks pass, retaining the original physical contour/DXF
checks and adding missing-source refusal, exact request replay and stale
reference/source refusal without new revisions. A neighboring native QA verifier
also passes thirteen checks. Session substitution and direct handler invocation
are not browser, provider, field or receiving-CAD acceptance.

## Mobile packaging and source preservation

GitHub's mobile export for `34713482` advanced beyond robots/sitemap and failed on
the server-only `/.well-known/oauth-authorization-server` route. The mobile build
now stashes that remote-server metadata family alongside the existing API and
server-backed routes. It does not change OAuth discovery on the web server.

Filesystem fixtures reproduced two destructive behaviors in the old helper:
deletion of an interrupted source stash and deletion of a concurrent source edit
during restoration. The helper now refuses an existing stash before moving
anything, checks owned paths and symlink ancestry, restores independent paths
after conflicts, and removes only empty directories created by that invocation.
Conflicting originals remain in the stash; neither version is overwritten.

Four preservation checks pass using the actual helper in owned synthetic file
fixtures. Only the Next build command is substituted in those checks. They do not
prove full static export, an installed mobile application or device behavior.
The real shared checkout's sources were not stashed for this verification.

The full Jest coverage job was still executing passing suites at its 15-minute
deadline in run 40523176848. It did not produce a complete passing result. CI now
allows 25 minutes and bounds compiler/test workers to two. Coverage thresholds,
test selection and failure handling remain unchanged.

## Remaining security and release boundaries

The dependency security gate remains red for Zod 3.25.76. A separate ignored
Zod 4.6.7 diagnostic installation exposed 83 application type errors, including
single-argument records, legacy error properties and transformed defaults.
No root dependency or running preview was changed by that diagnostic. A bounded
10,000-item synthetic array with a declared maximum of two traversed 10,000
elements on v3 and zero on the candidate v4. This is one resource-bound probe,
not proof that every application input has an adequate budget. Migration must
preserve request hashes, saved evidence, omitted keys and actual validation.

References: [upstream advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
and [Zod migration guide](https://zod.dev/v4/changelog).

Whole-repo lint memory exhaustion, accessibility findings on 11 routes, full
mobile/browser/account acceptance, worker drift, pending migration compatibility,
customer recovery/rollback, the deferred signing-key rotation and independent
instrument/field/CAD/print/ward-scale acceptance remain open. Production and the
localhost CAD drawing were preserved.

## GitHub follow-up and the next preflight

GitHub run 40527055014 at `a02f9c05` passes the native project design/set-out job,
TypeScript, row typing, Python worker and production web build. Its surface and
neighboring preflights advanced to the account-suspension check, which attempted
linking without an eligible synthetic notice publication record. The real notice
gate correctly refused that request.

The suspension verifier now creates a uniquely owned, process-local notice store.
It first proves that missing and newly published notices refuse linking, then
uses only a matured synthetic publication to exercise credential revocation.
The real filesystem notice reader and 30-day gate remain active. The deployment
record is neither read nor changed by this fixture. Exact notice files and empty
owned directories are removed afterwards. Twenty-two native checks pass, including
racing consent/suspension and transactional rollback. The neighboring PostgreSQL
protocol/config suites pass 21 checks; the native fieldbook audit upgrade also
passes and rolls all fixture DDL/data back.

The mobile build's next reported failure was `/p/[id]`. The source manifest now
also excludes that web-resolved shared draft and the inspected server-backed
project, firm, consent, live notice and support pages from the installed static
bundle. The web application's pages remain available. Mobile packaging is not
acceptance of these remote entry points or their navigation inside an installed
application; complete mobile/browser workflow checks remain required. The dynamic
page inventory found no other unstashed bracketed routes or explicitly dynamic
pages. A new full export is still needed to discover rendering-time requirements.

Before the Zod major change, an ignored diagnostic captured 2,169 synthetic input
cases across 93 exported schemas, including 588 accepted results with exact output
key/value representation. This is a compatibility sample for migration, not
comprehensive validation or field evidence. Root Zod remains 3.25.76 and security
admission remains unsatisfied.
