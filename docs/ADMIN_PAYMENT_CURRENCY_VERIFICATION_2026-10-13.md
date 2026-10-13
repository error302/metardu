# Admin payment currency reporting — 2026-10-13

The admin payments endpoint previously summed `payment_history.amount` across currencies and returned one unlabeled total. Its desktop table, mobile cards, and Till-claim amounts also formatted every transaction as KES, so PayPal amounts stored in USD could be misreported as shillings.

The source now groups revenue and current-month totals by normalized transaction currency. Desktop and mobile payment rows use the recorded ISO currency, and the totals state explicitly that no conversion is applied. Formatting uses each currency's standard minor-unit precision. No exchange rate or historic rate was inferred.

Focused route and formatter tests pass 3/3. App and test TypeScript checks pass. The route test verifies KES and USD remain separate in returned rows and aggregates.

This is source-level evidence only. No production database or payment record was changed, and this update was not promoted. Admin-page behavior in production remains unverified while the existing Docker runtime is inaccessible; follow the repository's single-app promotion, backup, migration-compatibility, and rollback gates before release.
