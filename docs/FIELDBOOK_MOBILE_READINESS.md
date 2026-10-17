# Mobile fieldbook and controller readiness

## Active goal extension

The field-to-finish goal now explicitly includes a mobile-first fieldbook for
surveyor pilots, usable desktop file transfer, and honest instrument connection
states. Support manual observations, received/uploaded files and actual receiver
streams without inventing measurements, CRS, control or device compatibility.
Preserve customer data and the existing production stack. This milestone does
not complete the broader engineering-platform goal.

## Source changes, October 18, 2026

- Mobile and desktop share project selection, book naming, save status, saved-book
  selection and file tools. Switching projects saves the current book first,
  clears its database identity, and starts a blank setup in the next project.
  A first project selection keeps any observations already entered.
- Mobile cards have working edit actions. Editing preserves observation identity,
  row order and face/vertical-angle fields not exposed by the short mobile form.
  Save errors remain visible; retries reuse the observation ID.
- The browser database builder now preserves insert/update/upsert/delete when
  `.select()` specifies return columns. Previously this changed a mutation into
  a read, allowing fieldbook saves to look successful without writing.
- A fieldbook device copy and a coalesced UPSERT retry are staged in one existing
  IndexedDB transaction before sending. Only a matching returned book ID removes
  the exact pending operation. Network failure, missing acknowledgement and
  account changes keep the device copy. Sync refuses other owners' books and
  retains newer remote versions or unverifiable version checks.
- Pending local books take precedence over fetched server copies in the picker.
  Saving requires a known signed-in owner; no owner is guessed while offline.
- METARDU JSON import validates complete raw structures before replacing the open
  book, ignores file-supplied database identity/project ownership, and opens a new
  book in the selected project. Limit: 10 MB. JSON is the lossless interchange
  format; raw decimal strings, blank coordinates and incomplete observations
  survive round trips. Proprietary files are not accepted as fieldbook JSON.
- CSV export retains traverse face observations, vertical-angle components,
  heights and setup context that were previously omitted. Spreadsheet formula
  escaping is enabled. CSV is a spreadsheet copy, not the JSON restore format.
  Failed exports show an error and allow retry. Incomplete computation cannot
  silently produce an empty calculated PDF.
- Instrument controls are shared across layouts. Protocol and baud-rate selection
  replace the hard-coded Topcon preset. Instrument/target heights start blank;
  missing heights are not silently supplied as 1.5 m. Unrecognized raw frames
  are retained with a diagnostic instead of becoming fabricated observations.
  Serial transport termination updates connection state.
- Manual capture opens the entry form rather than creating a blank reading.
  Removed the nonexistent global-reading bridge and its origin-based conversion
  of easting/northing into a false slope distance/bearing. Existing real GNSS
  and serial capture paths remain available.
- Installation copy no longer promises no lost shots or automatic full offline
  access. The install prompt and manual-entry action no longer overlap the
  instrument bar. Setup inputs and primary actions have larger touch targets.

## Controller research and compatibility boundary

These are Android controller candidates for a pilot, **not METARDU-certified
instruments**:

| Controller | Manufacturer evidence | Pilot approach |
| --- | --- | --- |
| Trimble TSC5 / Ranger 5 | [Trimble controller documentation](https://help.fieldsystems.trimble.com/tsc5-ranger5/home.htm) | Check installed Android/Chrome versions, app-install policy, storage and job export first. |
| Hi-Target iHand55 | [Official product page](https://www.hi-target.com.cn/products/ihand55-handheld-controller), [manufacturer datasheet](https://www.hi-target.com.cn/wp-content/uploads/2025/07/iHand55-Professional-Field-Controller-EN-20240702-5.pdf) | Android 11 hardware with Bluetooth LE and USB-C/OTG; transport availability does not establish a matching receiver protocol. |

[Chrome 138 release notes](https://developer.chrome.com/release-notes/138)
document Android Web Serial over Bluetooth RFCOMM. This must not be generalized
to every USB serial adapter, controller OS build, embedded WebView or receiver.
[Chrome's Serial documentation](https://developer.chrome.com/docs/capabilities/serial)
describes the separate Android USB/polyfill path. METARDU checks API availability
in the current browser. Bluetooth LE GNSS capture requires the implemented NMEA
service/characteristic, not merely a device paired in Android settings.

The checked-in Capacitor Android project is present. The read-only
`node scripts/mobile-setup.mjs --check` reported **missing `out/` static export**.
No APK was built or installed. Auth/API origin behavior, static-export routing,
native plugin permissions, signing and controller installation must be proved
before distributing an Android package. Browser Add to Home screen remains
conditional on the deployed manifest/service worker and browser support.

## Verification and outstanding release work

Source tests cover the browser mutation request body, acknowledged/device-only
saves, account binding, queued replay, conflict/version failures, raw JSON round
trips, transfer error handling, mobile save retry/edit preservation and serial
termination/raw-frame retention. Existing GNSS provenance and fieldbook audit
tests remain part of the focused regression run. These are source/contract tests;
mock transport and IndexedDB contracts do not establish physical field delivery.

Source verification passed: 17 focused suites / 92 tests plus the autosave
race/retry suite / 2 tests (18 suites, 94 tests total), strict application and
test TypeScript checks, scoped ESLint, and staged whitespace checks. The combined
run includes 22 dashboard/search/activity tests: both search consumers now share
the real grouped API contract and working destinations; partial failures,
aborted/stale requests and activity polling failures are surfaced correctly.
Project/count query failure no longer appears as a zero-count empty dashboard.

The current Docker verifier reports `Docker ps failed. Check Docker access;
permission failure does not mean Docker is stopped.` No container, image,
volume, database, migration or production service was changed in this milestone.
The prior production build predates this fieldbook change; current deployment
and browser interaction evidence must be refreshed before promotion.

Remaining acceptance work:

1. Production candidate build, owned localhost CUA checks at phone/controller and
   desktop sizes, and one planned promotion to the existing `metardu-app` stack
   after migration compatibility and backup/recovery evidence are available.
2. Real IndexedDB quota/reload/offline/reconnect tests on the target controller;
   session expiration, interrupted acknowledgement, conflict resolution and
   persistent-storage behavior. A device copy can be lost if browser data is
   cleared, the browser evicts storage or the controller fails; keep JSON backups.
3. Manufacturer-sample numerical/unit audits for every legacy serial decoder.
   In particular, the legacy GSI angle/unit conversion needs independent review;
   a connection or a parsed value is not evidence of survey accuracy. Protocol
   presets remain provisional pending sample and physical instrument acceptance.
4. Physical connection, measure, unplug/reconnect, stale GNSS, wrong protocol,
   setup/height changes and cross-project tests against manufacturer job output.
5. Broader proprietary/CSV import staging and CRS confirmation. The separate
   legacy `/import` route still needs its missing-coordinate zero fallback and
   project-CRS contract repaired before claiming reliable coordinate imports.
6. Full raw-to-computation-to-export/print comparisons for actual road jobs and
   approval/evidence gates. No promise that every instrument/file can never fail.
