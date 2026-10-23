# Drainage set-out source consistency

Reviewed 17 October 2026. This note records source-level verification only; it does not establish production deployment or field acceptance.

## Finding and repair

`POST /api/project/[id]/setout` prepared drainage targets from a project and CRS snapshot read before its save transaction. An engineering design or reference-system change could land before the transaction wrote the new active set-out definition. The route now re-reads and holds the canonical reference row and project row inside the transaction, compares the drainage design hash and reference values to the inputs used for computation, and returns `409 DRAINAGE_SOURCE_CHANGED` without writing targets if they differ.

Project reference-system updates now use the same per-project advisory transaction lock as drainage set-out generation and update the canonical reference record and denormalized project CRS columns atomically. A regression test verifies the lock and commit order. Another test simulates a design edit between preparation and transaction lock and verifies rollback with no set-out definition insert.

## Verification

- `src/app/api/project/[id]/setout/__tests__/drainageSetout.test.ts`: 15 tests passed.
- `src/app/api/project/[id]/reference-system/__tests__/access.test.ts` together with the drainage suite: 18 tests passed.
- `npm run typecheck`: app and test TypeScript checks passed after the source changes.
- `npm run typecheck:tests`: passed after adding the reference-system transaction test.
- Scoped ESLint for the four changed API and test files: passed.
- `git diff --check`: passed for these files.

## Release boundary

These changes have not been promoted to the production `metardu-app` stack. Runtime health and inventory must still be checked with `npm run docker:verify`, followed by the repository's migration/recovery review and the planned single application promotion. Production and physical field-device behavior remain unverified.

## 23 October native persistence follow-up

`SETOUT_GENERATION_PERSISTENCE_2026-10-23.md` records reproduced pool leaks,
unconfirmed target/definition writes, ownership changes and grid reference
changes. Both generation paths now release clients, revalidate their locked
source and require complete persistence. The focused suites pass 41 tests;
22 native PostgreSQL checks include real failure triggers, prior-revision
preservation, 25 saves in a two-connection pool, actual transfer blocking and
exact original-record/ledger preservation and fixture cleanup. Authentication,
RLS, production promotion and field acceptance retain the separate boundaries
in that record.
