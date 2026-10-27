# Zod 4 compatibility and resource-limit repair

The application now pins Zod 4.6.7. Fresh full and runtime npm audits report
zero findings at every severity. This closes the source dependency finding
recorded in `DEPENDENCY_AND_PDF_RELEASE_REPAIR_2026-10-27.md`; it does not change
the running production image or prove production acceptance.

## Compatibility preserved

The migration uses Zod 4 directly, without a `zod/v3` compatibility import.
Pre-parse defaults use `prefault`, preserving normalization and transforms.
Redundant inner `optional` wrappers are removed where an outer defined fallback
already handles missing input. UUID-shaped legacy database identities use
`guid`, retaining the previously accepted syntax and case normalization.
Records declare their key schema; formerly implicit optional `unknown`/`any`
object properties declare that optionality. Zod error readers use `issues`.
Non-Zod diagnostic `errors` properties remain unchanged.

The changed API routes also declare the output types of 34 previously untyped
queries. Statements without returned rows use `never`; existence, advisory-lock,
invitation and member queries describe their actual result columns. Private
control-history rows remain opaque `Record<string, unknown>` values at the JSON
response boundary. SQL, authorization and payment behavior are unchanged.

## Verification

- A real oversized-array regression failed on Zod 3 with 10,000 element visits.
  On the installed Zod 4 root dependency it rejects before visiting any element,
  with one issue. The runtime dependency verifier checks this behavior and the
  exact installed, manifest and lockfile versions.
- Frozen synthetic Zod 3 fixtures cover 2,169 cases across 93 schemas, including
  588 successful outputs. Acceptance and exact successful keys/values match.
  These are bounded regression samples, not exhaustive equivalence proof.
- Four existing synthetic retained surface revisions preserve their hashes,
  original evidence and geometry. No customer database was copied or modified.
- Application and test TypeScript checks pass. Scoped ESLint reports zero errors
  and warnings across all 178 migrated source files.
- The complete local Jest runtime run passes: 746 suites, 7,138 tests and one
  snapshot; four suites / ten integration tests are explicitly skipped. This
  local run does not collect coverage. The separate preceding GitHub revision
  `459a04d1` passes its full Jest coverage job; the new revision needs its own CI.
- Native isolated PostgreSQL checks pass for surface persistence (20), account
  suspension (22), design/set-out revisions and ChatGPT protocol/configuration
  (21 tests). Actual Chromium-generated A4/A3 portrait/landscape PDF checks and
  external-resource refusal pass (five checks).
- The existing source preview returns healthy database status and renders the
  sign-in screen. This is anonymous source-preview evidence, not authenticated
  administrator, real-device, customer production or field acceptance.

No SQL migration, applied migration hash, customer data, production image,
provider/billing state or browser drawing storage was changed for this repair.

## Remaining release gates

Await this revision's Linux CI, web/mobile builds, coverage and browser results.
The preceding CI still reports browser navigation failures, an accessibility
sweep failure and repository-wide lint failures. Passing scoped lint does not
close those repository-wide gates. Preserve the existing Cloudflare containment
and owner-deferred signing-key rotation blocker.

Production promotion still requires reviewed pending migrations, worker artifact
compatibility, a verified current-production rollback tag and backup/restore
evidence. The earlier rejected customer clone must not be bypassed. Independent
survey, instrument, receiving CAD, calibrated print, provider lifecycle and
large-project/device recovery acceptance remain separate open gates described
in `PRODUCTION_GOAL.md`.
