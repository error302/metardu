# Staged device archive restoration

The user approved staged restoration on 21 October: preserve the original file,
validate account/project and exact identities, restore as pending, require server
confirmation of imported receipts, refuse overwrites, and resume storage failures.

## Data and authority

- Accept the existing version-one device archive containing actorId, projectId,
  edits, requests and legacy records. Decode valid UTF-8; retain the original bytes
  and their SHA-256 before touching existing journals.
- Bound input to 50 MiB and 10,000 records per category. Reject unsupported formats
  and explicitly foreign account/project records before restoring journal content.
- Validate edit/request envelopes, keys, raw schemas and hashes. Invalid owned
  records remain in the source archive as unreadable inspection material.
- Never adopt imported results as delivery acknowledgement. Restore immutable
  requests with null results; an already verified matching local result is kept.
- Preserve full edit ancestry. An orphan valid request receives an editable local
  representation that dispatches only its already retained exact request; it does
  not invent a reviewed baseline. New edits still descend through real receipts.
- Restore valid legacy editable content as an unknown-baseline local edit with a
  stable staged identifier. Preserve original queue IDs, metadata and recovery links
  in the source bytes; do not insert or dispatch old generic queue operations.

## Storage and failure behavior

A separate IndexedDB archive store retains immutable source bytes and stable legacy
bindings before restoration begins. Existing edit/request stores stay in place.
Validate all target identity collisions before journal writes. Existing matching
records are idempotent; different records are refused. Each existing store retains
its strict transaction guards. Because the stores span databases, restoration is
resumable, not falsely described as one atomic cross-database operation. A complete
marker is written only after every eligible record is durable. Failure retains the
source and any completed matching records. Resume revalidates the source and target
records, including when an earlier complete marker exists.

No imported file can authorize network dispatch, account reassignment, field
verification, or replacement/deletion of current work. Restore performs no HTTP.

## User flow

The recovery panel offers a file selector, validated inventory summary, visible
source identity and an explicit review checkbox before Restore. Persisted archives
remain available for exact-byte download and resume. Unknown records are counted
and remain downloadable. Restored edits join existing recovery/compare/copy/retry
controls. Account/project changes invalidate an in-flight preview or action and
cannot expose another account's archive summary or contents.

## Evidence and release limits

Use real idb with fake-indexeddb for source tests: round trip after deleting original
journals, exact raw strings/null/zero/special keys, forged imported receipts, original
source bytes, ownership, collisions, quota interruption/resume, changed preview,
ancestry/orphans and unknown legacy preservation. Component tests cover the explicit
review path and scope changes. Run affected tests, strict typing, scoped lint and
security gate. Native browser import/reload/quota tests remain a separate gate.
Preserve the existing production stack and CAD drawing; no SQL, builds or promotion.
