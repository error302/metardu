# Production authentication release — 15 October 2026

## Deployed release

The existing METARDU production stack now runs verified source commit `c1591bda793e415d300f7f58176e1ced8c020f6b`.

- Candidate/promoted image: `sha256:fd7c870ce441fd67bf9b7ad64d0ad9675aec2094b70a323eaef99c1c8dda966b`.
- Protected previous production image: `sha256:44106f7a461e7e4d204f4416744ca2852cbf2ef94b5fbc15ea35d31dd9d1f5d6`, tagged `metardu-metardu-app:rollback-current`.
- The image was built from the committed Git archive, through the existing Docker builder and reusable `candidate` tag. No other checkout, preview app, dated image tag or additional builder was created.
- Only the existing `metardu-app` service was replaced. PostgreSQL, Redis, worker, collaboration, NTRIP and backup retained their IDs, start times and mounts. The uploads volume was preserved. The pre-replacement app had no transient download files.
- Runtime settings, including authentication secrets, public/callback origins and provider credentials, were checked for continuity without logging credential values.

The release was frozen before concurrent pipeline/contour work in this shared checkout. Later pipeline commit `da38df3d`, including migration `108_pipeline_asbuilt_history`, and unfinished contour changes are **outside this release**. They remain preserved for their own verification and promotion; this record does not describe the latest moving checkout as fully deployed.

## Migrations and preservation

Production previously had 109 applied entries. These three migrations were applied through the ordinary unified runner:

1. `105_marketing_email_deliveries`
2. `106_setout_capture_v2`
3. `107_verticality_capture_evidence`

The deployed release now has **112 applied entries**, matching its packaged migration files. Every historical checksum was preserved; no `--force`, rollback SQL, applied-file edit or ledger hash replacement was used.

Before production execution, the pinned migrations succeeded on the existing marked synthetic rehearsal database, and PostgreSQL validated the setout and verticality capture constraints. The existing rehearsal container was temporarily started and returned to its prior stopped state. No customer database clone was made.

Existing backup-recovery proof was reviewed. With the application stopped for the actual cutover, a fresh database/uploads checkpoint completed at `2026-10-14T22:06:19Z` (15 October in Nairobi), retaining previous archives. Its compression/header integrity checks passed; this fresh checkpoint was not itself restored. Previous app logs were archived privately in the existing backup volume. Normalized counts and content fingerprints of the original columns in the four affected existing tables matched before and after migration. No customer row values were logged.

Migrations 106/107 retain historical evidence and are forward-only. The protected image does not authorize reversing these constraints or restoring old archives over later customer writes. Recovery after subsequent writes requires a reviewed forward repair or recovery/cutover procedure.

## Live account and inbox verification

A newly created, clearly named disposable QA account used an alias of the owner-approved Gmail inbox. Generated passwords/cookies were kept only in an ignored local state file and never printed. Inbox links were checked against the QA identity before use.

The following passed against **https://metardu.space**:

- Signup persisted the account and completed its trial/onboarding; verification and welcome deliveries were accepted.
- Email/password login established an authenticated HTTPS session.
- The verification token from the received email confirmed its bound account.
- Recovery generated the received reset email; a forged token was rejected.
- The received reset link changed the QA password and sent confirmation.
- Reusing the consumed link failed, the old password failed, the pre-reset session was revoked, and the new password signed in normally.
- An authenticated settings password change also sent confirmation, revoked its session, and allowed subsequent new-password login.
- Gmail confirmed **five messages in INBOX**, each with the inline METARDU logo: welcome, verification, reset and two password-change confirmations.
- The exact newly created QA account was deleted with ID/email/name/creation-time guards; its generated credential/cookie file was removed. Existing customer passwords were not changed.

Fresh public HTTPS health returned HTTP 200 with database, Redis and disk healthy. Post-promotion `npm run docker:verify` passed health/ownership and the one-application inventory checks.

These are live service/API and inbox checks. No claim is made that a complete browser interaction or engineering field workflow was certified. The existing browser policy restriction was not bypassed, and the user's localhost CAD drawing/storage was not touched. Use the configured production HTTPS login origin for normal account access.

## Source/build evidence and tools

- Auth source verification: 122 focused tests; normal pre-push verification: 523 related tests passed, one skipped, plus typing and lint. GitHub Gitleaks passed for `c1591bda`.
- The Linux image passed native runtime dependency checks, five standalone packaging tests, production compilation/type validation and generation of all 219 static pages. One large asset was excluded from offline precaching; the build succeeded.
- `scripts/promote-auth-release.mjs` pins the source, guards identity/configuration/ledger continuity, stages only committed migration metadata, and preserves release receipts.
- `scripts/verify-live-auth-release.mjs` implements the disposable account verification and exact-account cleanup. It requires an explicitly supplied owner-approved inbox for signup.
- Detailed private receipts are ignored under `.cache/release-verify/auth-release/`: `promotion.json`, `live-auth.json` and `delivery.json`. No generated QA credential file remains.
