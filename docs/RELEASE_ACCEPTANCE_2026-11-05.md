# Web release runtime acceptance - 5 November 2026

Application bb27634c0adf6528c312d001fa45fcbf39a18245 was promoted once to the existing metardu-app stack at approximately 08:12 UTC (11:12 Nairobi). Exact OCI image: sha256:5033ff094b91dcb283efd98363f80118ff51017e7801447c60d550f08bc26798. The subsequent 9d2429a82980523b07bad307a2e98cceead7f3a3 commit changes release tooling/tests/evidence only and is not the deployed application identity.

## Admission and retained attempts

Exact application CI41809733033 passed all 17 jobs; CodeQL41809733136 and gitleaks41809732870 passed. Its complete pinned source admission passed all three TypeScript projects, 71 release contracts, 328 related tests across 38 suites and 3415-file whole lint with zero errors/warnings/a11y findings. The later retry-tool change independently passed 76 release contracts, tool typing and scoped lint, and normal push invariant/schema gates. Its own CI41991619223 is pending; its CodeQL41991619516 and gitleaks41991619288 passed. Do not relabel the application's CI with a later tool-only revision.

The first candidate failed before app build/startup on Docker Hub token retrieval. build-1.log and the original failed attempt remain intact; SHA-256 5d1d19db0feab46a4d55ac3052e22a6835e43690186d22b89844b2a8bc76f707 was rechecked after success. One explicit same-SHA retry used the existing desktop-linux builder and reusable candidate tag, with no application container created. Its normal Next build and native PDF runtime checks passed. The known 6.02 MB Workbox chunk remains outside precache. One promotion followed; the running application did not change during build.

## Runtime and preservation

Public and origin health report exact bb27634c and healthy. Anonymous home/login return 200 and dashboard/equipment/admin return the expected login redirects. These are bounded observations from the host, not continuous or independent external availability proof. Required running support identities/start times/mounts and application uploads were preserved. The existing completed migration service was aligned to the exact promoted image and exited zero. Only the METARDU_BUILD_SHA Compose environment value was persisted; all other environment bytes/config settings were compared unchanged, without printing credentials.

All 129 applied hashes remain unchanged, with no pending SQL. The original-record fingerprints across all 22 retained workflow tables were checked both during promotion and independently after migration-service alignment. The restricted runtime database role passed. Current-production rollback remains protected. Worker artifact parity passed. The exact live app's PDF native constructors, observed pixels and PNG encoding passed; five public PWA assets match deployed byte hashes. The first public asset check stopped after two assets and remains failed evidence; the remaining three passed a separate bounded check. No restart/DNS change was used to make that check pass.

## Backup evidence

The Nov5 scheduled 02:00 UTC backup did not run: Windows Power-Troubleshooter records sleep from 01:29:04.5329263Z to 07:05:02.5202268Z, covering the schedule. Cron is running; no attempted run or completion is logged for that scheduled time. Mains idle sleep zero does not prevent every host sleep path.

Fresh manual pair db_20261105_080456.sql.gz/uploads_20261105_080456.tar.gz passed full gzip, SQL-header and tar reads. The first verifier used incorrect tar option ordering and failed; its receipt remains, and the same existing archive passed the corrected read without another backup. An older Nov4 pre-backup manifest comparison found 98 unchanged archives and the Oct3 pair absent; no unchanged claim is made for those absent files. The current complete 104-archive baseline was recorded before promotion.

The promotion checkpoint db_20261105_081137.sql.gz/uploads_20261105_081137.tar.gz passed independent full gzip/header/tar reads. All 104 pre-promotion archive hashes are unchanged; 106 archives are now present. This is manual/pre-promotion archive evidence. A subsequent scheduled success, offsite copy and actual restore remain separate gates; no archive was restored over customer writes.

## Outstanding acceptance

This increment deploys retained registered draft PDF recovery, point display/small-site fit/named markers, malformed-TIN refusal and responsive marketplace cards/gallery/dialogs. Prior source Chrome QA showed five synthetic points and a populated synthetic marketplace on phone/desktop; PDF registration/replay used mocked entitlement. These do not establish deployed Enterprise 42-point PDF creation/recovery, receiving CAD, calibrated print or field acceptance. Authenticated deployed browser verification is pending after Computer Use reported an unattached debugger and mismatched native window capture. The user's original CAD drawing is preserved; no browser storage was changed to force acceptance.

Desktop native synthetic DXF/PDF evidence and the unpublished X draft belong to a separate Desktop checkout/task. Automatic Desktop-Web pairing and a Desktop release are not claimed. Retain legacy parcel containment, independent-surveyor/field, receiving-CAD/calibrated-print, provider, physical Android/iPhone install and closed-app reminder, offsite/key recovery, security-deferral and signing-rotation gates. Rate limiting remains in-process for the single app container. Oracle was removed as a target and was not contacted.

Evidence: .cache/release-verify/unified-release/bb27634c0adf6528c312d001fa45fcbf39a18245/release-verified.json and its linked immutable attempt, source, promotion, migration alignment, preservation and native/PWA receipts. The broader production-readiness goal remains active.
