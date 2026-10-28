# Current archive recovery and UI admission - 28 October 2026

This follow-up continues the pushed bf25ebc101eeb71c17b6fa821b336aa7cc5f5706
checkpoint. Its CI run 40739987727 passes both complete lint jobs, strict
app/test/tools typing, dependency/release security, API typing, web/mobile builds,
Python/native RTKLIB and design/set-out PostgreSQL checks. Full Jest coverage is
still running. Browser and axe checks still fail; this follow-up repairs their
observed causes and needs its own browser/axe CI acceptance.

## Explicitly authorized archive restoration

The user approved restoring only db_20261028_020001.sql.gz and
uploads_20261028_020001.tar.gz in the existing owned rehearsal service, checking
the upgrade and removing exact temporary copies. The production database and
services remained unchanged. The archive digests are:

- Database: a002cdb75658abdde685ae943b2b8b0c42aea3e256b6f278aff84e8579629b8b
- Uploads: c3af5321672e683836c3eb19ab71ee34e49fc99782491313b4ab2122a50e3700

The first atomic restore refused a missing metardu_app grantee role. Its
transaction rolled back and temporary resources were removed. The retry created
that archive role without login in rehearsal and explicitly removed it afterward.

The actual restoration passes ten checks: 154 application tables and 1,117 rows
match the production counts/content fingerprints; all 25 uploads (669,562 bytes)
match native archive digests; the normal provisioner upgrades the restored
119-entry ledger to all 128 migrations. Original customer-column fingerprints
and every historical migration hash survive. The restricted login and ordinary
organization RLS checks pass. No customer payload or filename is logged; no
customer file is written into the workspace.

The temporary database, three temporary roles and extracted upload directory
were removed. The backup container's original networks were restored. The
current passed receipt is test-results/recovery-proof/verification.json; its
historical October 9 predecessor is retained privately under
.cache/lint-cleanup/current-recovery/historical-verification.json. Failed and
successful attempt receipts are retained separately. This is current local
archive recovery/upgrade evidence; offsite copy/key recovery and measured recovery
objectives remain separate requirements.

## Exact rollback verifier and synthetic upgrade

The full pinned workflow upgrade at bf25ebc1 passes all eleven checks, including
four incompatible-state rejection variants, preserving data and all historical
hashes, and removes its dedicated synthetic database/role.

The general release rehearsal also executes the actual running app image's
strict startup verifier against the 128-entry synthetic registry. It passes after
a catalog-query repair: same-named constraints in four retained historical test
schemas had inflated an unqualified count. The query now checks only the exact
public.setout_observations and public.verticality_readings relations. Both
constraints must still exist and be validated. No archived schema is removed.
Temporary SQL files in the app and the rehearsal network attachment are cleaned
by the existing verifier. This establishes current-image startup compatibility
with that registry, not a promoted image.

## Browser and accessibility repair

The eight axe failures concern missing form/select/delete-button names, dim
secondary text, and an unfocusable scrollable quotation list. Controls now have
specific names and units, repeated rows have distinct names, secondary text uses
the theme's readable secondary color, and the quotation list is a named keyboard
focusable region. No calculation, input value or evidence rule is changed.

Browser tests now use the current public navigation, the actual phone/tablet
breakpoint, maintained catalogue prices, the expandable FAQ, registration's
preserved next destination, a new control observation row, and the Files & saved
books disclosure. Unsupported compliance/offline branding assertions are removed;
actual sign-in controls, workflow layout bounds and overflow remain asserted.
No additional test is skipped and no gate threshold is weakened.

CUA checks on the owned 127.0.0.1:3021 source preview verify landing dashboard
routing to login?next=%2Fdashboard, visible professional-review FAQ guidance,
current named CORS controls, and a 375-pixel phone layout with aligned workflow
steps and no horizontal document overflow. The CAD drawing/storage was untouched.
App/tool TypeScript, 15-file zero-warning lint and nine affected Jest tests pass.
Source-preview evidence is distinct from CI and production verification.

## Unified source-check command limits

The production-to-source diff contains 999 TypeScript paths (41,074 argument
characters), exceeding Windows command-line limits. In the existing unified
checkout, Jest now obtains the complete changed set through --changedSince,
and lint uses the bounded whole-owned-file runner. Tooling TypeScript is also
checked. The historical archived-source mode retains its original behavior;
this release uses only the current unified checkout. No test filter, coverage
threshold, ratchet floor or migration constraint is relaxed.

## Remaining promotion work

Production still runs image 061033364840 / OCI revision 08fae427, and the old worker
still fails artifact parity. Finish exact selected-source CI/browser/axe and full
coverage, pin coherent app/worker candidates and exact current rollback artifacts,
then promote once through the existing stack. Confirm the public release identity
and ordinary account workflows afterward. No production migration, image build,
image tag or service replacement was performed by this follow-up. Broader field,
CAD/print/provider acceptance and the owner's deferred key rotation remain open.
