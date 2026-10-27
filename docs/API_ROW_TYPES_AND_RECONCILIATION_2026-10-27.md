# API result contracts and missing payment identities

Follow-up to `LINT_MEMORY_AND_ADMISSION_REPAIR_2026-10-27.md`.

GitHub run 40547575587 at `a3b41503` completes both complete lint scans on
Linux: 2,817 files in eight sequential batches. It reports the same 512 errors
and 47 warnings as the local scan, with maximum worker RSS below 2,600 MiB.
Both jobs correctly fail on findings rather than exhausting memory. Security,
typing, native design/set-out and web/mobile builds pass; browser/accessibility
jobs still fail. The Jest coverage job is cancelled, not a passing full-suite
result for that revision. The preceding `7477ff19` full Jest coverage run passes.

## Source repair

Thirty remaining API queries across twelve routes now declare the returned
rows. Commands without `RETURNING`, including transaction statements, use
`never`. Existence, advisory-lock, RLS-context and basemap-owner lookup queries
describe the actual result columns. The read-only submission preview declares
its nullable project metadata and optional legacy district/division values.
No permissions, stored migration or database values change for these types.

Transpiling eleven of the twelve changed routes produces identical executable
JavaScript to the preceding commit after Git newline normalization. The sole
executable change is a missing-transaction-identity guard in M-Pesa
reconciliation. After the existing abandoned-checkout timeout rule, a row
without an identity remains pending and cannot initiate a provider lookup or
subscription write. The query normally excludes null values; the guard also
handles an empty identity without a non-null assertion.

Four regression cases exercise the actual route with a mocked database and
provider: missing authorization, null and empty transaction identities, and a
retained identity with an ambiguous provider result. They perform no provider
or customer-database operations. The focused related run passes 20 tests across
six suites, including the existing read-only preview and PayPal webhook tests.
Strict application and test TypeScript checks pass. Scoped ESLint covers all
twelve routes and the new regression file with zero errors and warnings. The
first scoped lint attempt times out under measured host memory pressure; after
that worker terminates, an isolated retry completes successfully. This is not
a passing whole-repository lint result.

The static inventory now reports two untyped queries, both in the unchanged
community jobs route. Its current table uses UUID identities, but its POST
generates a `job-` timestamp identity, swallows insert errors and reports a
successful save. Its GET can substitute seed listings for an empty or failed
database query. That route needs a real persistence/authentication and truthful
listing repair; invented row types or a higher baseline would conceal the
defect. The remaining whole-repository findings and independent release gates
are still open.

No actual billing/provider, customer entitlement, production service, migration
or browser drawing state was modified. Synthetic route tests and type contracts
do not prove a paid provider lifecycle or production deployment.
