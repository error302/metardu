# METARDU owner workspace

The owner needs to find blocked customers, reconcile money received, review
professional credentials, answer product feedback and monitor service health.
The existing dashboard buried these tasks in a single long page and labelled
account updates as activity. This redesign builds on the existing admin APIs,
permissions and subscription catalogue without adding dependencies or migrations.

## Structure and contracts

- Overview prioritizes manual payment claims, ISK reviews, open feedback and
  subscriptions/trials ending in the next seven days. Revenue stays separated by
  transaction currency. Entitlements are not presented as recurring revenue.
- Customers shows recent accounts and pending credentials, with links to the
  searchable directory, role assignment, suspension and plan management.
- Billing shows upcoming endings, entitlement counts and an explicitly reviewed
  manual grant. The ledger remains responsible for merchant reconciliation.
- Communications publishes in-app notices to catalogue audiences and shows the
  latest ten announcements. It does not send email or alter marketing consent.
- Feedback lists the latest thirty reports, unresolved first. Review requires an
  internal note and the last observed status. A conflicting update returns 409;
  the status change and audit entry commit in one transaction.
- System contains database/process diagnostics and expandable browser metrics.
  Production backup, migration and Docker actions remain outside the web UI.

The shared Zod response contract rejects malformed dashboard payloads. Query
failures stay errors, rather than becoming reassuring zeroes. All new admin
mutations require platform admin roles on the server. The client layout also
withholds controls from organization admins and unauthenticated users.

## Reporting boundaries

Customer counts and recent signups exclude only records that match both the
exact `SYNTHETIC PRODUCTION VERIFICATION` name and the established
`synthetic-production-check-%@example.invalid` email pattern. All records remain
stored and accessible in the directory. Project/payment inventory remains
inclusive and is labelled accordingly. No data is deleted or rewritten.

Subscription counts describe active entitlements, which can include manual
grants. Trials remain separate. The upcoming-end list uses `trial_ends_at` for
trials and `current_period_end` for active subscriptions. A null end date is
not invented. Completed payments remain split by currency, with KES-only charts.

ISK actions submit PostgreSQL's exact timestamp text to preserve microseconds
for optimistic locking. Rejecting a pending ISK submission clears its number
under the existing API contract; it does not suspend the customer.

## Design and verification

Use METARDU's existing typography, charcoal surfaces and copper accent. A compact
top navigation replaces the duplicated sidebar/mobile menu. Sections are deep
linkable and respond to browser history. Tables scroll within their panels;
the overview collapses to one column on narrow screens. Keyboard focus, loading,
empty, failure and reduced-motion states are included.

Verification covers business data contracts, trial dates, synthetic-account
separation, feedback conflict/audit behavior, ISK timestamp submission,
announcement review and focused UI states. Production verification must confirm
the actual schema and the deployed authenticated screens; source tests alone do
not establish deployment, email delivery or payment settlement.

## Implementation sequence

1. Add shared dashboard and feedback contracts plus read-only operations queries.
2. Connect existing mutations, fix ISK concurrency data and announcement audit.
3. Introduce the shared shell and six focused sections; preserve directory and ledger.
4. Run focused Jest, TypeScript and lint checks; inspect browser states.
5. Commit and push only this task's files. Promote one pinned candidate only after
   reviewing pending migrations and existing backup/recovery evidence. Preserve
   the current production rollback and the other task's working source changes.
