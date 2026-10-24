# Project settings and protected account authority — 23 October 2026

## Verified source defects and repairs

The original Project Settings form displayed Arc 1960 / 37S when the saved
reference was absent. A name-only save sent that inferred reference and a full
stale `traverse` object through the generic database proxy. Two regression tests
failed against that behavior before the repair.

The settings form now preserves missing reference choices, loads the owned
project API with an explicit retry state, and sends only changed metadata to
`PATCH /api/project/[id]`. Reference selections are saved separately through the
canonical reference declaration. Missing or unsupported selections cannot become
a usable declared grid. Loading an earlier project cannot hydrate a later
project's form. Failed or unconfirmed saves retain the draft and release the
busy state. The delete button uses the existing owner-checked project endpoint;
no retained project was deleted during verification.

The PATCH contract rejects reference columns, ownership, complete traverse JSON,
engineering data and unknown keys. An atomic owner-constrained SQL UPDATE merges
only the requested closure key into the database's current traverse. Untouched
closure and chainage evidence are omitted; zero is valid, while an explicitly
cleared measurement is stored as null. Malformed legacy traverse JSON refuses a
closure update. A missing, suppressed or inconsistent returned update cannot be
reported as saved. No migration or production record change is needed.

The generic database endpoint also accepted reference-column updates/upserts
outside the declaration workflow and accepted subscription insert/update/upsert/
delete from an ordinary signed-in account. Seven focused regression cases failed
before the guards were added. Reference mutations now require the declaration
workflow; subscription writes require authorized billing/admin endpoints.
Owned reads and non-reference workflow progress updates remain available. The
unused client helper that could seed a year's professional entitlement was
removed after confirming it had no source callers. This is source authorization
proof, not an attempted exploit against production customers.

## Evidence and practical limits

- 58 focused tests across five suites pass: settings drafts/recovery, strict
  PATCH persistence, generic proxy guards, raw observation guards and the
  reference panel. The original two settings and seven proxy failure cases
  were observed before the fixes.
- `node scripts/verify-project-settings.mjs` passes 12 checks using the actual
  source handler and PostgreSQL in an exact marked temporary schema in the
  existing rehearsal database. Checks cover concurrent evidence changes,
  closure zero/null, ownership change, malformed legacy JSON, trigger-suppressed
  updates, database exceptions and 25 saves through a pool of two connections.
- The fixture's six retained public-table fingerprints and all 120 synthetic
  migration records/checksums matched before/after. Its exact owned schema was
  removed. The adapter bounds authentication; copied fixture tables do not
  establish ordinary-account HTTP or RLS acceptance. Receipt:
  `.cache/project-settings/native.json`.
- CUA browser checks used the retained project labelled `SYNTHETIC capture
  recovery browser QA - not field evidence` on the existing 127.0.0.1:3021
  source preview. Clearing the three reference selectors and pressing the
  unchanged metadata save showed the explicit no-change notice and disabled
  reference declaration. No reference declaration, deletion or metadata write
  was submitted. Reload restores the retained selection.
- Browser layouts: 1280×900 page 1270/1270 px, form 624/624; 390×844 page
  380/380 px, form 332/332. Shared Geist typography is retained; grid fields
  use the existing numeric font role. Screenshots:
  `.cache/project-settings/desktop.png`, `mobile.png`. This is computer-browser
  viewport evidence, not physical phone or field proof.
- The initial source preview load was slow and reported FCP 3.32 seconds and
  TTFB 2.65 seconds. These development observations are not production timing
  acceptance.

## Source, live and external blockers

| Boundary | Status / remaining work |
| --- | --- |
| Source | This milestone closes metadata/reference and subscription proxy defects. Map drawing still creates projects through generic insert rather than the canonical quota-checked creation endpoint. Its drawing preservation and quota/concurrency acceptance need a separate repair; do not claim all creation paths are complete. Other concurrent topographic/engineering changes remain under their own acceptance records. |
| Live | Existing production runtime verifier passes. Public home, pricing, login and health returned 200 at 19:20:58 UTC. Public release ID remains `unknown`; these source changes have not been promoted or proved on production. Review the whole candidate, migration compatibility, recovery and pinned rollback before the coordinated promotion. |
| Operations | Approved delayed automatic tunnel startup and restart actions are configured. Reboot/forced-crash recovery was not exercised. This Windows host must stay powered and connected. Signing-key rotation remains explicitly deferred by the owner. |
| Providers / field | Paid approval/webhook/entitlement/cancellation, inbox delivery and real field/physical print acceptance remain separate. Resend domain listing is blocked by the restricted key; no diagnostic email was sent. ChatGPT remains behind notice eligibility, deployment and human consent gates. |

See `PUBLIC_AVAILABILITY_2026-10-23.md`, `REFERENCE_DECLARATION_INTEGRITY_2026-10-23.md`
and `CREDIBILITY_ACCEPTANCE.md`. A finished source milestone is not evidence that
the broader engineering platform or company operating process is complete.
