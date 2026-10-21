# Device Archive Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Restore exported device archives into durable pending recovery without
overwriting existing work or trusting imported acknowledgements.

**Architecture:** Preserve original bytes and stable recovery bindings in a separate
archive database. Validate and preflight the existing edit/request journals, then
restore idempotently and mark completion only after both stores finish. Existing
server acknowledgement and compare/review paths retain authority.

**Tech Stack:** TypeScript, Zod, idb, Web Crypto, React, Jest/fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-10-21-device-archive-restoration.md`

## Global Constraints

- Use this checkout and existing runtime; preserve concurrent survey-plan work.
- Accept the existing version-one archive; cap at 50 MiB and 10,000 rows/category.
- Preserve exact source bytes and raw data, including unknown heights and zero.
- Never adopt imported receipts or issue HTTP from restore.
- Refuse account/project mismatches and conflicting identity reuse.
- Retain staged sources and completed matching records after failure; support resume.
- No SQL, build, extra container, promotion or CAD browser-storage mutation.

## Task 1: Shared validation and exact retained-request recovery

**Files:** `src/lib/offline/bookEdits.ts`, `bookDeliveryJournal.ts`,
`bookEdits.test.ts` in the same directory.

**Interfaces:** Export `bookEditEnvelopeSchema` and `bookRequestEnvelopeSchema`.
Add `findBookEdit(actor,project,id): Promise<BookEdit|null>` and local origin
`{kind:'retained_request'}`. That origin requires a matching retained request and
dispatches its body unchanged; absence or mismatched content refuses before HTTP.

- [x] Write failing tests for missing/mismatched and exact recovered requests:
  ```ts
  await retainBookEdit(actor, { ...edit, basis: { kind: 'retained_request' } })
  await expect(sendBookEdit(actor, project, edit.requestId)).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
  ```
- [x] Run `npx jest --runInBand --runTestsByPath src/lib/offline/bookEdits.test.ts`.
- [x] Implement schema exports, missing-safe lookup, and matching exact dispatch.
  Require matching project, book, type, name and canonical data. Use the existing
  dispatch budget/retry callback; never derive a new baseRevision for this origin.
- [x] Rerun the same suite and existing journal tests; inspect all results.

## Task 2: Staged archive restoration and durable resume

**Files:** Create `src/lib/offline/bookArchiveRecovery.ts` and
`src/lib/offline/bookArchiveRecovery.test.ts`.

**Interfaces:**
```ts
previewBookArchive(actor: string, project: string, bytes: Uint8Array): Promise<ArchivePreview>
restoreBookArchive(actor: string, project: string, bytes: Uint8Array, reviewedHash: string): Promise<ArchiveSummary>
listBookArchives(actor: string, project: string): Promise<ArchiveSummary[]>
readBookArchive(actor: string, project: string, hash: string): Promise<Uint8Array>
```
`ArchivePreview` identifies hash, valid edit/request/legacy counts and unreadable
records. `ArchiveSummary` adds local completion status. Neither claims delivery.

- [x] Write round-trip and authority tests using real idb, including:
  ```ts
  const preview = await previewBookArchive(actor, project, bytes)
  await restoreBookArchive(actor, project, bytes, preview.hash)
  expect(await readBookArchive(actor, project, preview.hash)).toEqual(bytes)
  expect(fetch).not.toHaveBeenCalled()
  ```
- [x] Run the archive suite red; use temporary exported signatures only if needed
  to reach behavioral assertions without a TypeScript import error.
- [x] Implement byte copying before awaits, fatal UTF-8 decoding, bounded format
  validation, record hashes/ownership, source retention with stable legacy UUIDs,
  full collision preflight, sequential strict journal retention and complete marker.
- [x] Add deliberate storage-failure, conflict, mutated-preview, forged-result,
  special-key, orphan/ancestry, unreadable and partial-resume cases. Confirm resumed
  imports do not duplicate records and existing verified local receipts stay intact.
- [x] Run archive and affected journal suites; fix failures without clearing data.

## Task 3: Recovery panel import, inspection and resume

**Files:** Create `src/components/fieldbook/FieldbookArchiveRecovery.tsx` and its
test. Add it to `src/components/fieldbook/FieldbookRecovery.tsx`.

**Interfaces:** Component receives actorId, projectId and onRestored callback.
It consumes Task 2 APIs, accepts `.json` input, shows preview and explicit review,
and lists retained archives with download/resume actions. Successful restoration
refreshes the existing inventory. Key the scoped child so account/project changes
cannot retain an old preview; guard async effects and download/open actions too.

- [x] Write failing component tests for preview without writes, disabled restore
  before review, confirmed restore, failed restore/resume, exact-byte export,
  unchanged open editor and a scope change while file reading is in flight.
- [x] Run `npx jest --runInBand --runTestsByPath src/components/fieldbook/FieldbookArchiveRecovery.test.tsx`.
- [x] Implement ordinary accessible labels, buttons, status/error text and scoped
  async guards. Use existing theme variables and recovery controls; do not auto-open
  imported content or implicitly dispatch.
- [x] Run component, recovery, page, archive and journal suites together.

## Task 4: Verification, evidence and scoped commit

**Files:** Update `docs/FIELDBOOK_DELIVERY.md`, this plan and the design note only
as needed to reflect final behavior and actual evidence.

- [x] Run `npm run typecheck`, scoped ESLint and `npm run security:gate`; observe
  existing live process handles until terminal. Inspect the final affected suite.
- [ ] Use CUA through owned 127.0.0.1 for browser proof only when the source runtime
  is available; preserve CAD and never seed storage through automation internals.
- [x] Record exact source/native/browser boundaries and remaining release gates.
- [x] Review `git diff --check`, then commit explicit own paths without including
  concurrent survey-plan edits. Keep the full platform goal active.

## Self-review

The four tasks cover each spec boundary, no imported acknowledgement is promoted,
and every restore UI action uses the byte-bound source and checked scope. Cross-DB
failure is explicitly resumable. Exact API names are shared by Tasks 2 and 3.
Execution is inline in this already authorized continuation.

## Execution evidence

All implementation tasks were completed inline after the user approved the design.
The final affected suite passes 151 tests in 14 suites. Strict application/test
typing and the security gate pass; the final scoped lint and commit are recorded
in the task handoff. Source preview port 3021 has no listener, so the native CUA
import/reload step remains unchecked. No database, Docker service, build or
production promotion was changed. The separate synthetic migration-probe approval
is still unanswered. See docs/FIELDBOOK_DELIVERY.md for exact evidence boundaries.
