# METARDU typography acceptance

The shared page typography uses the existing locally served brand fonts. No new
font, external font request, package or production data change is part of this
increment.

## Roles across the site

| Role | Family | Use |
| --- | --- | --- |
| Interface | Geist | Body copy, navigation, forms, buttons, working headings and map controls |
| Display | Instrument Serif | Deliberate editorial headings using `font-display` or `font-serif` |
| Data | JetBrains Mono | Coordinates, bearings, tables, code and numerical chart labels |

`src/app/fonts.css` owns the CSS family stacks. Root body styles and Tailwind's
`sans`, `display`, `serif` and `mono` utilities now use these same stacks, including
responsive variants. Previously, the utility layer replaced body Geist and the
custom monospace with Tailwind's system defaults. Browser inspection reproduced
that mismatch on pricing descriptions, calls to action and the payment reference.

Map controls no longer force Calibri. Canvas-based map annotations use explicit
Geist stacks because canvas font strings cannot resolve CSS custom properties.
Numerical chart labels use explicit JetBrains Mono stacks. SVG chart labels keep
portable fallbacks rather than requiring a CSS variable in a standalone SVG.
The loading background, 404 and root error boundary share the same font roles;
the root error page imports the local font stylesheet independently of a failed
root layout.

The rendered map audit also reproduced clipped COGO controls: its 300 px child
was wider than the dock, and navy text was nearly invisible on dark surfaces.
The COGO cards now fit their container, inputs may shrink, all four labelled tabs
use a two-column grid, and action/foreground colours use the shared theme pair.
The traverse table keeps its own scroll area. Survey calculations are unchanged.
Registration's agreement checkbox now derives its accessible name from the
visible label instead of the compressed `Agreeterms` override.

Generated legal documents, spreadsheet templates, PDF engine fonts and an
operator's saved CAD text style retain their document-specific fonts. They are
separate output contracts, not interface overrides. No stored drawing font or
geometry has been rewritten.

## Evidence and acceptance limits

- Both strict TypeScript projects passed on 18 October 2026.
- Focused map regressions passed **27 tests across four suites**. The initial
  lint run found an existing unused profile interface and the root Tailwind
  configuration outside the typed projects. The interface was removed, and the
  Tailwind configuration is now included in strict application type/lint checks.
  Final lint passed all **30 modified TypeScript/TSX files**, including the root
  configuration, with zero errors or warnings. Both strict TypeScript projects
  passed again after the repairs. Receipts are under `.cache/typography/`.
- Normal CUA checks covered pricing at desktop/mobile widths, registration,
  login, import and the survey-map COGO panel at 1280×900 and 390×844, including
  field mode. Measured page/panel overflow checks passed; COGO inputs and buttons
  fit their panel. The original theme and viewport were restored. Local receipts
  and screenshots are in `.cache/typography/`.
- A normal synthetic UI radiation from E 0 / N 0, bearing 90°, distance 100 m
  produced E 100.000 / N 0.000. No point was added to the map. This is one planar
  arithmetic/UI check, not CRS, datum, scale or field acceptance.
- All 18 local font binaries match their recorded lengths and SHA-256 hashes;
  every font stylesheet URL is present in the local manifest. The source route
  inventory contains 236 page files and 19 layouts sharing the root styles.
- All application routes inherit the root stylesheet. Route-specific source
  overrides were inspected, but authenticated business/project states still need
  their own rendered acceptance evidence. A source inventory is not proof that
  every private page has been exercised in a browser.
- The existing owned host preview uses the isolated synthetic database at
  `127.0.0.1:3021`. It was restarted in place after stalled recompilation. No
  production or supporting container was restarted for typography work.
- The Samsung SM-S901U phone became available to Android debugging (Android 15,
  1080×2340, no installed METARDU package). A USB-only preview mapping was prepared.
  The user then requested continued testing in the computer browser and the
  device disconnected. No phone UI, offline or receiver acceptance is claimed;
  no app was installed and no device data was reset.
- The previous application promotion remains rolled back. Production is the
  healthy `4fa998fc` release, not the CAD/import candidate or these font repairs.
  See `CONTINUATION_ACCEPTANCE_2026-10-18.md` before planning another cutover.

Resend/domain verification, PayPal transaction acceptance, receiver/field
validation and ChatGPT notice/deployment/consent gates remain separate from this
typography increment and the continuing platform goal.

## Release preflight repair

The restored application has a live read-only `/app/rollback-migration-registry`
bind. The previous forward controller would omit that bind, then reject its own
mount-preservation check after cutover. This is a separately reproduced source
blocker, not the established cause of the earlier failed startup.

The controller now carries that exact inspected bind into the forward override,
with its read-only flag intact. It does not inherit the rollback `MIGRATIONS_DIR`:
the candidate verifies its packaged registry normally. Other volumes still need
to match exactly, and the supporting service identities/start times are still
protected. The historical cache directory remains a live mounted dependency;
do not delete it after promotion just because it is no longer the verifier's
selected registry.

The guard rejects a writable/non-bind/relative/ambiguous/missing registry or a
different application. Seventeen focused release/diagnostic/cleanup tests and
the promotion controller syntax check passed. No notice or migration integrity
gate was relaxed, and no production service was restarted by this source repair.

The pinned `d4d5742d` preflight passed both strict type checks, 406 tests across
46 suites and lint for all 79 changed TypeScript files against production's
baseline. The existing synthetic rehearsal and current image's strict rollback
verifier accepted all 117 migrations, with no pending SQL or customer clone.
This preflight did not build or promote an application.

## Pricing claim repair and current external checks

The read-only provider receipt at `.cache/provider-readiness/current.json`
was refreshed at 2026-10-18T06:12:19.505Z. Public metardu.space health, notice,
payment availability and the email logo returned 200. All 12 live PayPal plans
matched the catalog. The Resend key returned `restricted_api_key` for domain
listing, so provider domain status cannot be verified with this send-only key.
No email, order, subscription or charge was created by this diagnostic.

The configured PayPal plans have only regular billing cycles, and the subscription
request does not add a trial/start delay. Paid pricing-card links nevertheless
advertised “Start Free Trial” before directing the user into that paid checkout.
They now say “Choose Pro/Team/Firm”. The free-account link remains separate.
Payment copy distinguishes manual M-Pesa receipt review from recurring PayPal
approval, avoids an unproven “Verified Payments” badge and does not promise
unavailable standalone card checkout. Existing billing and approval guards are
unchanged. The root error page also imports the shared styles independently so
the font and control styles survive a root-layout failure.

The notice remains waiting/ineligible and linking is unconfigured. Its recorded
eligibility time is 2026-11-10T17:56:45.516Z; deployment and actual user consent
remain required. Historical inbox delivery receipts are not a fresh inbox test.
This later pricing/error-style increment requires a new pinned source check
before the single planned candidate build and promotion.

Its focused pricing/landing regressions passed six tests; both strict type
projects and all three modified pricing/error TypeScript files passed lint.
Normal browser clicks confirmed the three paid choices and zero checkout links
advertising a free trial, with no page overflow. “Choose Pro” reached sign-in
while retaining `/checkout?plan=pro&currency=USD&seats=1` as the return destination.
No account or payment was submitted. The new receipt/screenshot are
`.cache/typography/pricing-copy-browser.json` and
`.cache/typography/pricing-corrected-desktop.png`.
