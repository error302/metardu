# Complete lint coverage and honest admission

The previous goal turn made source progress: Zod 4 compatibility and the static
security-job import repair are pushed. GitHub run 40540764831 at `7477ff19`
now passes dependency/security admission, CodeQL, secret scanning, application
and test typing, native design/set-out persistence, Python worker tests, web and
mobile builds, and the full Jest coverage job (7,138 passed, ten skipped).
Browser, accessibility and both whole-repository lint jobs still fail.

## Memory failure and repair

Both Linux lint jobs exhaust their approximately 4 GiB V8 heap. A local bounded
probe reproduces the failure on entering test files after application files:
the parser retains two large TypeScript programs. A test-only project probe
completes the same test sample at about 1.4 GiB RSS. This matches the installed
typescript-eslint parser's module-level program caching behavior.

The new runner uses the installed ESLint 8 enumeration engine, including ignores,
extensions, overlapping scopes and unmatched-pattern refusal. It groups files
by their effective project configuration, lints at most 400 files per sequential
child, and releases the process between batches. Each child has a 3,072 MiB heap
limit and a three-minute timeout. Test files use the existing test tsconfig
directly; lint rule severities and all committed baselines are unchanged.

The parent rejects missing, duplicate, unexpected or unparseable results and
requires exact final coverage. Findings are combined for the existing warning,
accessibility and row-typing gates. The ESLint 8 internal enumeration dependency
is explicit and refuses an unreviewed future major version.

One complete local source scan finishes in eight batches: all 2,817 files,
including 2,255 application files and 562 test/helper files, with zero parsing
failures. Worker peaks range from 1,657 to 2,542 MiB RSS. Wall time is about
9 minutes 35 seconds on this Windows host. Both CI lint jobs have bounded
20-minute budgets; Linux performance still needs this revision's actual CI.

## An error-severity loophole is also closed

The full scan exposes 512 ESLint errors and 47 warnings. The static row-typing
gate additionally reports 32 untyped calls among 792 calls across 328 routes.
These findings are open work, not an accepted baseline.

The previous ratchet aggregates severity-one warnings but can report success
while severity-two findings remain. A real typed fixture reproduces this:
with every warning inside synthetic test baselines, the command exits zero
despite errors. The repaired command exits one, prints the errors and refuses
baseline updates while errors remain. The fixture now passes that regression.
No production baseline is updated or increased.

The two Node regression tests also compare complete results from actual ESLint
against isolated batches, including typed rules, per-file severity overrides,
ignored files and overlapping scopes. They reject incomplete, duplicate,
foreign and fatal-parser worker results. The full repository scan above ran
before adding the error-count reporting branch; the new admission branch is
verified by the real CLI fixture. Await the final revision's complete Linux run.

## Remaining work and evidence boundaries

Resolve the measured findings rather than suppressing them. The largest error
clusters include equipment API mapping (63), cadastral input (35) and the rapid
field keypad (32). Prioritize real boundary typing and declared CRS handling;
some test CRS findings describe intentional rejection cases and need semantic
review rather than removing their negative coverage.

The latest axe report has 12 affected routes, including several with failed
stylesheet requests after dev-server connection failures. Distinguish incomplete
rendering from genuine control-label/contrast defects. Visible unassociated
labels in the CORS selector are a confirmed source defect. Preserve failure
reporting and real page coverage when repairing scan reliability.

No customer data, applied migration, production service, provider/billing state
or localhost drawing was changed. Runtime verification still reports the
existing required stack healthy; archive/header evidence does not prove restore
recovery. Production promotion, the deferred signing-key rotation, real admin
and device workflows, instrument/CAD/print/provider and independent field gates
remain open under `PRODUCTION_GOAL.md`.
