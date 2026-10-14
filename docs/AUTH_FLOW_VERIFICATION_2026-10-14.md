# Account access and recovery repair — 14 October 2026

Update, 15 October: this auth release has now been promoted and its three pending migrations applied. Live HTTPS signup/login, received verification/reset links, password changes, session revocation and five branded inbox deliveries passed using a disposable QA account. See [the production release record](PRODUCTION_AUTH_RELEASE_2026-10-15.md); the runtime limitations below describe the earlier investigation checkpoint.

## Reported problem and confirmed defects

The owner reported that requesting a password reset displayed success but no email arrived. Source investigation confirmed that the recovery route returned HTTP 200 after both database errors and email-provider rejections. The client then claimed a message had been sent.

Other defects found in the same account journey:

- The Account Settings password form omitted the current password required by its API and allowed a shorter password than the API accepted.
- Signup verification and welcome messages depended on the browser successfully signing in and calling a second endpoint after the account was created.
- Login treated an absent sign-in result as success, and browser storage failures could interrupt navigation.
- Recovery links did not preserve the intended destination consistently; requesting a fresh link did not open the recovery view. Middleware also redirected signed-in users away from that view.
- Reset validation and token consumption did not share one database transaction. Password changes did not revoke existing sessions or send a security notification.

## Implemented behavior

- Recovery normalizes custom email addresses, uses the same normal acknowledgement for known and unknown addresses, and returns a retryable service error when the database or email transport fails. It does not claim inbox delivery.
- New reset tokens are stored as SHA-256 digests. The public token format excludes the digest prefix. Previously issued raw 32-byte hex tokens remain usable until their existing expiry.
- Reset checks, password update, session-version increment, and consumption of all outstanding reset tokens share a transaction. Settings password changes also invalidate reset links and require the current password. A concurrent password change cannot overwrite a newer hash using an earlier current-password check.
- Password changes send a branded notification with plain text, an inline METARDU logo, and an account recovery action. A failed notification does not undo a committed password change; the response and UI distinguish those outcomes.
- Signup performs idempotent trial setup and awaits verification/welcome transport results on the server. A pre-existing subscription is preserved; retries do not renew trials. A failed automatic sign-in leaves a clear account-created state.
- Verification send/confirm routes return retryable errors on outages. Account request and email transport timeouts prevent indefinite waiting on network/provider calls.
- Safe internal destinations are preserved through login, signup and reset. Recovery remains accessible to a user with an existing session.

No migrations were added or applied. The digest fits the existing `VARCHAR(128)` token column; applied migration files and hashes were not changed.

## Source verification

- The focused auth, recovery, account-page, signup, middleware, safe-redirect, OAuth identity, session-version and email suites passed: **18 suites, 122 tests**.
- `npm run typecheck` passed both application and test TypeScript checks.
- Changed-file ESLint passed without errors or warnings; `git diff --check` passed.
- Regression tests reproduced the original false-success recovery, missing current-password contract, onboarding-email dependency, reset notification/session handling and recovery-view defects before their fixes.
- These are source/synthetic checks. They do not certify browser behavior against the customer database.

## Live email transport evidence

One owner-authorized test was sent through the actual `src/lib/email.ts` transport using the configured credentials, sender `METARDU <noreply@metardu.space>`, and recipient `mohameddosho20@gmail.com`.

- Subject: `METARDU account email delivery check — 14 October`.
- Resend accepted the request; message ID: `01a13c1a-f251-7a19-94ba-2b80a99bf9d7`.
- Read-only Gmail search confirmed the message in `INBOX`, including the inline `metardu-email-mark.png` image.
- This test contained no reset token and changed no account or password.

This proves that the configured application transport can deliver a branded email to the approved inbox. It does not prove a production signup/reset database round trip or establish an inbound support mailbox.

## Runtime boundary and remaining verification

No containers, images, builders, volumes, migrations, or production passwords were changed. After a concurrent recovery checkpoint reported the original stack restored, the prescribed read-only `npm run docker:verify` was run. Sandbox access to the engine pipe failed; the approved read-only check with engine access passed: the app and required services were healthy, one application container was present, and no dated verification images/builders were present. The completed backup run was `2026-10-14T02:00:03Z`; this is archive/header evidence, not restore proof.

Read-only inspection inside `metardu-app` confirmed that its Resend key and sender are configured, its auth origin is `https://metardu.space`, and its sender is `METARDU <noreply@metardu.space>`. No credential value was printed. Its compiled recovery route lacks the new service-error message, confirming that this patch is not in the running image. A metadata-only query using the app's existing DB_HOST configuration confirmed the reset-token table, `users.session_version`, and `users.email_verified` are present; it read no customer rows.

The Windows shell could not resolve its configured database hostname `metardu-postgres` (`ENOTFOUND`), which is a Docker-network hostname. The browser security policy denied access to the existing localhost tab; no alternate browser or page-fetch workaround was used. Consequently, actual production account lookup, token persistence, reset-link consumption, cookie issuance and subsequent login remain unverified.

The configured `NEXTAUTH_URL` is the production HTTPS URL while the supplied browser tab uses HTTP `127.0.0.1`. NextAuth derives secure cookie defaults from its configured URL. That mismatch is a possible local-preview login problem, not a confirmed live diagnosis. The shared production environment and secure-cookie settings were preserved. Any local preview must use its own matching runtime configuration and a separate synthetic database.

Before promoting to the existing production stack, follow `AGENTS.md`: recheck `npm run docker:verify`, verify migration compatibility and backup/rollback evidence, and use the existing owned stack. Other source changes in this shared checkout include pending migrations; the historical rejected customer-clone operation was not bypassed. Then exercise one authorized test account through signup, verification, sign-out/sign-in, recovery, reset, rejection of the old password/reused link, new-password login, and session revocation. Confirm runtime transport behavior and database policies; a healthy standalone sender is insufficient to prove the full route.

## References

- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [NextAuth client sign-in response](https://next-auth.js.org/getting-started/client#using-the-redirect-false-option)
