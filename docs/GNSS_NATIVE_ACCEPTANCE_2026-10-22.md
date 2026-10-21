# GNSS native baseline check and configuration repair

## Maintained native gate

`python_worker/native_tests/` now retains the five native acceptance cases,
the three exact public RINEX fixtures and a hash/provenance/control manifest.
From `python_worker/`, the command is:

```sh
python -B -m unittest discover -s native_tests -v
```

Missing RTKLIB is a failure, not a skipped acceptance result. The Windows host's
missing-executable check exited 1 with its explicit requirement message. The
ordinary pytest suite stays separate; it does not silently substitute its fake
runner for this command. Fixture downloads are unnecessary during the test.
Git attributes retain their hash-pinned bytes across Windows/Linux checkouts.

The existing Python worker CI job now selects Ubuntu 24.04, installs its RTKLIB
CLI, then runs the native command as a blocking step after ordinary pytest.
Ubuntu's [package catalogue](https://packages.ubuntu.com/noble/rtklib) lists the
native CLI for that release. The workflow YAML parses, and source inspection
confirms the install step, working directory, command and absence of a
continue-on-error override. This is a committed workflow configuration, not a
claim that GitHub-hosted CI or its package installation has executed here.

At 2026-10-21T21:36:32Z–21:36:36Z, the maintained suite and exact fresh-process
CLI both passed all five cases with zero skips using owned temporary copies in
the existing worker/Python 3.11.16. A copy of the original whitespace-defective
source failed the real positive baseline test with SINGLE rejection. A copy
without the warning guard failed its real native configuration-error assertion.
Both failures were checked for their expected causes, not merely nonzero exit.
No checkout source was reverted to run these regression replays.

The first replay harness accidentally bypassed class setup on individual tests;
that report is retained as `maintained-native-incomplete-harness.json` and is
excluded from regression evidence. The corrected report is
`.cache/native-rtklib-reference/maintained-native-summary.json`, including both
valid regression failures, all five current successes and the exact CLI output.
It verifies source/fixture hashes, scratch removal, deployed source hashes and
unchanged worker identity/start time/mounts/health. The application handler was
not replaced, and no production job or customer record was created.

The maintained suite's SHA-256 was
`c22ff15acb5dd3ebef7de77bed98b32725ac5fca725ccbe8fcce78f46ba940ab`.
This small GPS case is repeatable native regression coverage. Receiver diversity,
multi-constellation/L5, long workloads, independent control and live route/field
acceptance remain separate gates.

## Earlier native investigation and source repair

Local date: 22 October 2026; execution timestamps below are UTC on 21 October.
The repaired checkout wrapper now produces real relative RTKLIB solutions on a
pinned upstream reference pair. This is controlled native-executable evidence,
not a deployed worker route, current surveyed-control comparison or field trial.

## Defect and repair

`python_worker/rtklib_baseline.py` generated values such as
`pos1-posmode = static`. The installed RTKLIB option parser retains the space
after `=` and rejects enum tokens. The process nevertheless exits zero and
continues with defaults. The initial real run produced 115 SINGLE rows in each
of three scenarios, regardless of requested ambiguity mode or changed base.
The source result parser correctly rejected those non-relative solutions.

A diagnostic rerun recorded invalid-option messages for mode, frequency,
ambiguity, antenna postype and output enums. This is consistent with the
[upstream loadopts/str2enum implementation](https://github.com/tomojitakasu/RTKLIB/blob/71db0ffa0d9735697c6adfd06fdf766d0e5ce807/src/options.c).
Removing only value-leading whitespace in an in-memory hypothesis probe changed
the results to FIX/FLOAT. No application source had been changed at that stage.

The source fix writes `name=value` configuration and rejects native stderr
`invalid option ...` diagnostics even when exit status is zero. This prevents a
successful-looking position row from concealing rejected processing settings.
The public inputs, base-control requirement, input order, measurement parser,
native timeout and accepted FIX/FLOAT quality set are unchanged.

Twenty-four parameterized enum-token regressions and the zero-exit warning case
failed before the fix; 11 existing tests passed. After correction the focused
suite passes all 36 cases. The existing fake-runner boundary tests remain unit
tests; the real native checks below supply separate executable evidence.

## Reference provenance

The public inputs and supplied base ECEF are from RTKLIB's own
[rnx2rtkp test makefile](https://github.com/tomojitakasu/RTKLIB/blob/71db0ffa0d9735697c6adfd06fdf766d0e5ce807/app/rnx2rtkp/gcc/makefile),
pinned to commit `71db0ffa0d9735697c6adfd06fdf766d0e5ce807`.
The bounded host download executed no upstream code. Source data stay ignored
under `.cache/native-rtklib-reference/`, with URLs, sizes and hashes in its
manifest; the inputs are not customer observations.

| Upstream file under test/data/rinex | Bytes | SHA-256 |
| --- | ---: | --- |
| 07590920.05o, rover | 68266 | `8474af556633e9c03293a8fb1e2c1f55180b42336b17574a84fda06eb6a02f9e` |
| 30400920.05o, base | 74854 | `732ba88d70412b6a70c145494a8030f79b844e99bd5225d0e7b7d982d2e2b540` |
| 30400920.05n, navigation | 96480 | `ff1e2a3190c99a77b1b8bf2cd37d813a536bcd27498998c40a50fcca2f806d77` |

These are GPS RINEX 2.10 observations from 2 April 2005. The makefile supplies
base ECEF (-3978241.958, 3382840.234, 3649900.853) m. Host pyproj3.7.2 / native
PROJ 9.5.1, with network disabled, converted that vector under RTKLIB's WGS84
convention to latitude 35.132057067754985°, longitude 139.62430657739648°,
ellipsoidal height 73.90766507294029 m for the wrapper's explicit base input.
This is a supplied test reference, not certification of its datum epoch,
antenna calibration or present-day geodetic accuracy. RINEX approximate header
positions were not treated as independent surveyed truth.

## Actual native outcomes

The corrected source, without the hypothesis override, ran at
2026-10-21T21:21:07Z–21:21:09Z through the installed native executable. Each
relative scenario produced 115 position rows:

| Scenario | Native quality | Last output |
| --- | --- | --- |
| Static, L1+L2, continuous ambiguity | All 115 FIX | lat 35.160865963°, lon 139.613843011°, h 68.3841 m; five satellites, ratio 680.3 |
| Same input, ambiguity resolution off | All 115 FLOAT | lat 35.160865965°, lon 139.613842943°, h 68.3826 m; ratio 0 |
| Supplied base ECEF X increased by 1 m, other axes unchanged | All 115 FIX | Rover ECEF change approximately (0.9999693, 0.0000776, 0.0000948) m |

The synthetic control-shift assertion uses a 0.002 m numerical tolerance on
response to the imposed change. This is sensitivity/consistency evidence, not
an absolute-accuracy threshold. RTKLIB's fitted sigmas, FIX flags and ambiguity
ratios do not establish external survey accuracy.

A separate actual SPP run produced 115 SINGLE rows and was rejected as
non-relative. Another scratch-config probe supplied an invalid frequency enum
while leaving other options valid. Native RTKLIB exited 0 and produced 115 FIX
rows, but the corrected wrapper rejected the configuration diagnostic before
accepting a result. This verifies the new guard against the real executable,
in addition to the unit regression.

## Execution boundary and preservation

The required read-only `npm run docker:verify` passed first. The exact existing
healthy non-root worker was then inspected and reused; no container or builder
was created. The probe compiled only the checkout's trusted baseline module in
its own Python process and supplied public reference text. It did not import or
patch the worker application, register a route, invoke its HTTP task endpoint,
read its secret, open an application cache or submit a background job.

- Container: `f86194410484340ad061c0fdc34bf9b6de6ac442c7be7d5336fd27321c668105`.
- Image: `sha256:30e83e33403f9e5accb6eddeccb940ece69df71d4a7b27d69406bf96f453241a`.
- Native package: `2.4.3.b34+dfsg-1+b2`; executable `/usr/bin/rnx2rtkp`, SHA-256
  `8ac15cd49ac3d47abbcd5cb572512e9260c657598e6fb4882e1d3bcde27b779b`.
- Audited original wrapper SHA-256:
  `0406e59549fa356fa39de3f8e0a36948381db67a989f2e870377d8dbcae9a665`.
- Corrected wrapper SHA-256:
  `06d005d28dd9acad15a34136d717289988a453b2d8477ed206444c9d1c5e197e`.

Native child processes used lowered priority and CPU, memory, file-size and
30-second time bounds. Their environment excluded worker secrets. Inputs,
configurations and requested position outputs used task-owned `/tmp` directories;
their removal was verified. Container ID, image, start time, mounts and healthy
state remained unchanged, as did hashes of deployed main/gnss source files.
The running handler remains the older deployed implementation described in
`WORKER_ACCEPTANCE_2026-10-21.md`; this probe is not a hot-patch or promotion.

## Source verification and remaining gates

The full isolated host worker suite passes **83 tests, two network checks skipped,
zero failures**. It ran actual worker source with only test log/cache destinations
redirected. Before/after worker source inventories and the protected existing
OSM cache matched. Inventory SHA-256:
`cc9d9284a0db189ae759927b4e5f1b702e78ff3f098b511b401967f0e27c392c`.
The source security gate and scoped whitespace checks pass. Host Python 3.14.7
differs from CI 3.12; the native check executed the wrapper under the installed
worker Python 3.11 runtime. CI was not run remotely in this checkpoint.

The native-binary/reference gate has stronger evidence now. Release still needs
one coherent worker artifact with the corrected source/dependencies, actual
route and authenticated application/browser acceptance, and independently
surveyed receiver/control/antenna/epoch/vertical-reference checks. The known
worker artifact drift, Fieldbook migration/recovery, online CRS specification
review, backup-script repair, provider/payment, device and field gates remain.

Ignored evidence includes `native-summary.json` (initial failure),
`native-diagnostic.json`, `native-whitespace-hypothesis.json`,
`native-corrected.json`, `native-configuration-rejection.json`,
`native-assertions.json`, `control.json`, download manifest and throwaway probe
scripts under `.cache/native-rtklib-reference/`. Host test evidence is
`pytest-red.log`/`pytest-green.log` there, plus `.cache/worker-native-source-tests.log`,
`worker-native-pytest.xml` and `worker-native-source-report.json`. The earlier
worker source reports are retained separately.
