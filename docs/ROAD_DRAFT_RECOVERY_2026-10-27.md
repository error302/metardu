# Road draft recovery and conditional saves

27 October 2026, Africa/Nairobi. Continues `ROAD_LIVE_EDITING_2026-10-27.md`.
The complete field-to-finish production goal remains active.

## Implemented workflow

The saved-project visual workspace now uses `RecoverableRoadWorkbench`. It reads
the signed-in account and the complete saved road/reference from an authenticated
owner-scoped endpoint. The public worked example remains a disposable example.

Incomplete input text is retained in a device record keyed by account and project.
Its original road and reference identities, text draft, device entry/sequence and
checksum are preserved. Web Locks and conditional replacement prevent a stale
tab from replacing a newer device record. Corrupt records, quota/write failures,
unsupported formats and missing acknowledgements do not trigger eviction or an
automatic server save. The recovery download retains the original raw device
record and current in-memory inputs. It does not upload them to another service.

A new save first awaits device retention, then retains the exact command and its
request ID before POST. Editing is held while the request is unconfirmed. Check,
retry and cancel reuse that original command. A final outcome must match its
account, project, request, hash, road and reference before the pending record is
cleared. Confirmed cancellation atomically turns the device request back into an
editable retained draft. It does not discard the entered inputs. A cancellation
arriving after a committed save returns that committed outcome; it does not undo
the design.

Once the exact current text draft has been acknowledged on the device, ordinary
navigation is allowed. Reopening the project restores that draft. Until then,
the existing leave protection remains. A newly loaded saved-source mismatch
retains the original device source and blocks its save; the latest saved design
can be reviewed separately. Inputs are not automatically rebased or reassociated.

Development Strict Mode initially exposed a real stale-load bug: an aborted
first initialization could disable a successful newer editor. Load generations
now admit only the matching initialization result. That sequence has a regression.

## Server command and evidence

`/api/engineering/road-workbench` requires authentication and the original actor
identity. It uses the recorded project owner under a project lock. The save
compares the complete engineering JSON and reference-record hashes before
changing the road. The existing finite JSON/budget validation runs before
normalization, and PostgreSQL checks that the application JSON round-trips to
the stored value without precision loss. Unsupported values are refused and
preserved. The update replaces only the `road` JSON key; unrelated engineering
data is retained. The editor-only
command is evaluated against the original observations and ground association;
it cannot change those observations or silently adopt them for a moved alignment.

The project update and final request outcome are written in one transaction.
The existing immutable design register retains the exact command, outcome,
original complete engineering snapshot and reference record. Their hashes can
be independently reconstructed. A retry returns the original outcome, including
when the current project has since changed. A cancelled request is final, so a
late commit of that request cannot apply. Unconfirmed cancellation is never
reported as final.

The request stream uses discipline `road`, entity type `road-workbench-request`
and the request UUID as entity ID. Each request has its own register stream;
`R01` alone does not identify a road design. This supplies retained request
evidence, not a finished active-road revision selector or issued-file binding.
Existing quantity/alignment register streams retain their own identities.

No migration or dependency was added. The existing design-register lifecycle
provides the immutable storage. No applied migration hash was edited. The full
saved-road schema was factored into a shared client/server module, preserving
the quantity source validation introduced in the preceding checkpoint.

## Verification

- **210 tests / 29 suites pass**, covering the road engines, original workbench,
  conditional save/replay/cancel, device corruption/quota/version checks and the
  recovered editor. The final receipt is `.cache/road-recovery/jest.json`.
- Application/test TypeScript, scoped direct ESLint, the security gate and
  runtime health results are recorded in `.cache/road-recovery/source-checks.json`.
- `scripts/verify-road-workbench-recovery.mjs` used only the existing marked
  `metardu_runtime_verify` database on `127.0.0.1:55433`, in the inspected existing
  rehearsal container. It neither starts containers nor applies migrations.
  Its **13 native/HTTP checks** include anonymous refusal, ordinary synthetic
  surveyor sign-in, concurrent duplicate delivery, one immutable outcome,
  independently hashable source evidence, deliberate receipt discard/recovery,
  cancellation before a late save and changed project/reference refusals.
- CUA used the actual `127.0.0.1:3021` preview and an ordinary free synthetic
  account. It retained a blank easting, opened a fresh tab and observed the same
  blank field with its original source. It then restored the coordinate, edited
  the first synthetic VIP level from -1 to -2 and observed a confirmed save.
  A point-name edit survived normal Dashboard navigation and browser Back, then
  received its own confirmed save. No browser storage internals were written.
- The separate **seven-check browser/native receipt** compares those observed
  browser inputs to actual project JSON and its exact archived request, verifies
  original snapshot hashes, retrieves that outcome through the current route,
  confirms the operator stayed free/ordinary, and rechecks migration hashes.
  See `.cache/road-recovery/browser-native.json` and its source hashes.
- A separate opt-in native test runs the actual command implementation under
  the non-superuser/non-bypass `release_app` role. Its nine checks include actual
  high-precision/non-finite JSON refusal, the road-only update, durable
  cancellation and an injected archive-append failure rolled back to a savepoint.
  It verifies that its users, project and outcomes all disappear after the outer
  rollback and that migration hashes are unchanged. See `native-sql.json` and
  `native-sql-jest.json` in the evidence directory. The final backend source
  hashes are bound there. No existing account was reopened for this test.
- The browser/native receipts precede the final server JSON precision guard and
  a checked-command narrowing in the recovery handler. The final native SQL
  receipt pins the updated backend; the final source regression/type/lint checks
  cover the handler. These are separate evidence scopes, not a claim that the
  earlier browser run used identical final source bytes.
- Desktop 1600 x 1000 and phone-width 390 x 844 observations found no page-width
  overflow. The focused phone profile had no clipped labels. Viewport overrides
  were reset. `saved-workspace.png`, `reopened-draft.png`, `phone-profile.png` and
  the DOM-backed observations are in `.cache/road-recovery/`.
- Native receipt discard and mocked lost-response UI cases are distinct from
  real instrument/field connectivity proof. These fixtures do not establish
  simultaneous multi-crew load, browser crash/power-loss or physical-phone
  acceptance. The synthetic session was signed out and its exact test profile
  suspended; its immutable test evidence remains in the isolated database.

## Remaining gates and compatibility

Device retention requires Web Locks, SubtleCrypto and available browser storage;
the record budget is 3 MiB. It is not an encrypted backup or cross-device sync.
The shared engineering JSON policy also limits 200,000 values and 64 nesting
levels. Preserve and split larger work packages instead of coercing their data.
Manual recovery of corrupted files, reviewed conflict merging, collaborative
writer roles and broader work-package/capacity acceptance remain work.

Other legacy engineering write paths still need the conditional request flow.
They can ignore the new association/recovery metadata or overwrite a newer JSON
snapshot after this endpoint commits. Its retained evidence remains available,
but this checkpoint does not claim all project writers are protected. A coherent
candidate and rollback compatibility review remains mandatory before promotion.

Retained-terrain selection and justified ground reassociation, direct graphical
editing, a selected active road revision and independently validated revision-bound
IFC/LandXML/DXF/instrument delivery remain open. Existing IFC source selection and
missing-height handling remain blockers. Independent surveyor/field/receiving-CAD/
printer checks, ordinary admin and physical-phone acceptance, ward-scale capacity,
provider/payment, rejected customer-clone/restore admission, worker artifact
alignment, owner-deferred signing-key work and production release retain their
existing gates. Preserve Cloudflare parcel containment and the localhost CAD
training drawing. No customer migration, production build, push or promotion was
performed.
