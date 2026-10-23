# Application production-mode build and standalone asset repair

Date: 2026-10-23. Scope: Windows host source compilation and generated-artifact inspection. No application server, container, migration, deployment or customer restore was started by this check.

## Result

Next 15.5.27 compiled the current working tree, passed its generated-route type validation and generated all 219 static pages. The Next process and subsequent standalone preparation both exited zero. This was a dirty-tree build starting at `210a99c8`, not a pinned release artifact. PWA generation was disabled for this Windows check; the repository's build configuration skips ESLint.

Inspection of the generated server then exposed a packaging defect: it selected `./.cache\\app-production-build` as its runtime `distDir`, but preparation had copied all 972 browser assets into the hardcoded `standalone/.next/static` directory. The directory the server actually selected was absent.

`copyStandaloneStaticAssets` now resolves both the source and packaged destination from the selected build directory. It preserves the existing owned-path and junction checks, replaces only that generated static directory and refuses preparation if compiled static assets are missing. The default `.next` layout remains supported.

Repreparing the same compiled artifact with the repair produced the expected directory. All 972 packaged files matched the compiled source files by SHA-256. No listener was started. The old misplaced directory was retained in this ignored diagnostic artifact; fresh builds do not need it.

## Verification

- `node --test tests/standalone-packaging.test.mjs`: eight passed, zero failed, zero skipped with approved host access. Coverage includes default and nested build directories, stale asset replacement, repeated preparation, a runtime-relative file read, missing assets, source environment preservation and a Windows ancestor-junction escape guard.
- Syntax checks passed for both packaging scripts and the test file. Scoped `git diff --check` passed.
- `npm run typecheck` passed for both application and test projects after the host-preview route reference was restored.
- `npm run security:gate` passed: 119 applied migration hashes pinned, API/PWA guards verified, and 635 test files plus 3,100 source files scanned. This is a source gate, not a live penetration test.
- The generated standalone package verified PDFKit built-in font metrics and included the installed canvas binding, PDF.js native canvas runtime and Sharp codec metadata. This does not certify Linux native bindings.

Ignored local evidence:

- `.cache/app-production-build-inputs.json`: 3,160 recorded build inputs; inventory SHA-256 `9dbef4a340d3a1098fb3013f4970faf79b1fc6648e759f58400ebfe6530d9c9f`.
- `.cache/app-production-build-next.log`: successful full Next build and route output.
- `.cache/app-production-build-package.log`: initial standalone preparation output.
- `.cache/app-production-build-layout-red.json`: actual generated-server check failed because the selected static directory was absent.
- `.cache/standalone-assets-package.log` and `.cache/app-production-build-layout.json`: repaired preparation and 972-file comparison passed.

## Build isolation and preservation

The build used `.cache/app-production-build`, the existing installed dependencies and synthetic build-only environment values. The harness verified that Next's actual dotenv loader retained cleared or synthetic values for 141 application environment keys. Production database, provider and worker credentials were excluded. No dependencies were installed and production services were unchanged.

Two restricted attempts failed with Windows `EPERM` while creating different generated route directories. Their logs and input receipts were retained as `app-production-build-attempt1-*` and `app-production-build-attempt2-*`. The approved host-access attempt completed the build.

The aggregate `.cache/app-production-build-result.json` deliberately remains `preservation-check-failed`: its initial guard rejected Next's mutation of `tsconfig.json` include ordering. It must not be presented as an all-green receipt. Inspection of the installed Next TypeScript configuration writer confirmed its in-place sorting behavior. A separate guarded restoration verified the original compiler options and include path set, restored the clean starting configuration text, restored the prior host-preview route reference in `next-env.d.ts`, and confirmed every other recorded input hash was unchanged at that checkpoint.

`.cache/app-production-build-restoration.json` records that follow-up. The original `tsconfig.json` byte hash was not reconstructed; its semantic settings and clean starting Git text were verified. Do not claim that every recorded input remained byte-identical. The three packaging source/test changes were intentionally made after the compilation checkpoint and verified by focused tests plus preparation of the real compiled artifact.

## Release boundaries

This closes a source packaging defect and provides Windows production-mode compilation evidence. It does not prove Linux candidate behavior, PWA/offline delivery, successful administrator browser access, customer restore, payment/provider operation or physical surveying accuracy. No production promotion occurred.

The separate runtime health check passed, but `npm run docker:verify:worker` still reports that the deployed worker does not match the current source contract. A healthy process is insufficient evidence of those capabilities. Review the worker candidate, migration compatibility, backup/recovery evidence and the remaining acceptance register before any planned promotion. Keep the existing app stack and verified rollback protection; create no duplicate preview stack.
