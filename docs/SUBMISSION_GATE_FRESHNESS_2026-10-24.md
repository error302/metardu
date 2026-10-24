# Submission gate freshness — 24 October 2026

## Observed defects

The quality-check panel retained a successful parent result during a pending
rerun. An older project request could later replace the current project's
verdict or error state. A callback identity change triggered another validation
request, and a completed request notified its parent after unmount.

The real submission component accepted a `passed: false` result whenever its
reported block count was zero. Its existing-document ZIP button and binary
archive assembly button did not use the gate state at all. Text on that page
also implied generated files were compliant and ready for official filing.

## Resulting behavior

- Starting validation immediately clears the parent result and permission to
  generate documents. Failure leaves it cleared; an explicit successful retry
  is required to regain permission.
- A keyed panel resets visible results on project changes. Request generation
  tracking ignores late success or failure after replacement/unmount, including
  effect cleanup. Callback identity changes do not refetch validation.
- The submission verdict belongs to one project. Both `passed: true` and zero
  blocking findings are required. Pending, unavailable, failed and other-project
  results disable generation.
- Document generation and both JSON package controls use guarded handlers;
  binary archive assembly is likewise guarded and disabled. Previously
  generated file downloads remain available for inspection. The separate NLIMS
  draft workflow retains its own validation and is not certified by this panel.
- Generated-file and archive messages request review and professional sign-off;
  they do not claim legal compliance or permission to file.

This change governs client request admission and displayed results. It does not
cancel a generation request already admitted, prove that previously generated
files match the latest saved revision, or replace server-side validation.

## Source verification

Five lifecycle regressions failed against the original panel; three existing
display/parser tests remained passing. Real submission-component tests also
reproduced the failed-verdict admission and existing-document package bypass.
An initial integration fixture lacked the required document metadata; that
fixture was corrected before the behavior failures were evaluated.

98 focused tests across six suites pass: panel, real submission component,
road gate, full configured gate, package integrity and cadastral document
routing. The lifecycle suite covers pending reruns, old-project success and
failure, callback replacement, unmount, same-project effect replay,
failed-rerun recovery and explicit retry.
The parent integration covers disabled dossier controls during reruns, failed
verdicts, project changes and all pending archive controls. All use synthetic
responses and do not generate or alter customer files.

The security gate passes with 119 pinned applied migrations. The full application
TypeScript check passed during verification; the first full test TypeScript
check found an unrelated `tests/surface-revision-binding.test.ts:37` fixture
missing `maxVertexSpacing` and `indexInterval`. This concurrent surface work was
preserved. That concurrent fixture was subsequently corrected in the shared
checkout; full application and test TypeScript checks and scoped ESLint then
passed. The retained final Jest report is
`.cache/submission-gate-freshness/jest.json`.

## Runtime and browser boundaries

The read-only production runtime verifier passed: one application container,
required support services and HTTP/database/Redis health. Backup completion at
`2026-10-24T02:00:04Z` remains archive/header evidence, not restored recovery.
No service lifecycle, migration, production promotion or real export occurred.

Chrome QA navigation on the owned `http://127.0.0.1:3021` origin timed out. The
new QA tab was confirmed blank after its first attempt; a subsequent navigation
and frame-tree observation also timed out. The source health request timed out
after 15 seconds even though the existing loopback listener/process was live.
These are failed observations, not evidence that the preview process stopped.
The shared preview was not restarted and no drawing or browser storage was
changed. Browser acceptance of the repaired flow remains unproven.

## Remaining gates

Saved project/revision binding for road design and declared criteria, fresh
authenticated browser acceptance, server-side generation admission under
concurrent edits, original-observation-to-deliverable review and actual
production/field acceptance remain open. The legacy scalar road safety and
widening helpers also remain open as recorded in the banking audit. This
checkpoint does not establish broader production readiness or registry approval.
