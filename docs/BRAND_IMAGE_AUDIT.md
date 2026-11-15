# Brand-image audit — what a surveyor user sees

Date: 2026-11-13. Triggered by the first active field surveyor testing
production (metardu.space). Findings are grounded in two field screenshots
(fieldbook session error; Set Out / stakeout screen) plus live checks.

## Findings and status

1. **Stakeout distance of 8,979 km.** A target typed with a southern-hemisphere
   northing far outside the survey grid was accepted silently and navigated to
   as if plausible (proximity beeps included). Cause: no grid-range check on
   the Set Out form, and no implausibility guard in the navigation HUD.
   Fixed 2026-11-13: targets are validated against the selected survey grid
   (`validateCoordinateRange`) before start, far-from-view targets require an
   explicit "Start anyway", and the HUD shows a red banner when the target is
   >100 km away instead of presenting the number as normal guidance.

2. **Overlapping map cards.** Set Out panel, stakeout card, GPS-navigation
   card and zoom controls stacked on top of each other on desktop and mobile.
   Fixed 2026-11-13: one compact stakeout strip above the status bar, the
   duplicate floating GPS-navigation card removed, slimmer tool dock.

3. **Map pick for stakeout missing.** Targets could only be typed.
   Fixed 2026-11-13: "Pick on map" in Set Out (crosshair cursor, tap to
   navigate; picked coordinates are grid-valid by construction).

4. **Loading screen rendered as a small centred box.** Route boundaries
   rendered the shared loader without a viewport-size wrapper.
   Fixed 2026-11-13: shared `FullPageLoading` (100dvh below the app bar) for
   root, map, fieldbook, process, dashboard and tools; verified in the
   production HTML stream.

5. **Alarmist error copy.** "Export JSON before reloading to keep your open
   book" implies data loss during a mere connection drop.
   Fixed 2026-11-13: "Connection lost. Your open book stays saved on this
   device — reconnect and tap retry."

6. **Outage window + 17-minute recovery.** The host rebooted 2026-11-12
   21:15; the stack came back only after manual login. Fixed 2026-11-13:
   Windows auto-login (LSA-stored secret, no plaintext password), Docker
   Desktop start-on-boot (Startup entry + AutoStart=true), containers already
   carry `unless-stopped`. Recovery after a reboot is now unattended and
   takes ~1–2 minutes total (Docker start → containers → tunnel service).

7. **Tunnel reliability.** The Cloudflare Tunnel (metardu-tunnel) was found
   `down` (0 connections) with the service process alive. Restored via a
   user-level connector (4 connections registered 2026-11-13 10:31:55–58Z).
   Connectivity pre-checks show region2.v2.argotunnel.com unreachable on this
   network (TCP + UDP blocked); region1 passes. The service-side connector
   still needs one elevated restart to return to the normal path; the
   temporary connector survives until then.

## Evidence

- `npm run docker:verify` — all seven services healthy, migration exit 0 on
  the promoted image, backup within 36 h (2026-11-13 final run).
- Public probes: `/`, `/map`, `/api/auth/session`, `/api/public/health` → 200.
- Live browser smoke: login page renders; map workspace renders with 0
  console errors.
- Typecheck, eslint (src/app/map, StakeoutPanel, LoadingState), and jest
  (`src/app/map` 48 tests, fieldbook captureFlow, useGpsTracking) all pass.

## Open items (real blockers, not polish)

- Elevated restart of the `cloudflared` Windows service to retire the
  temporary connector; investigate the region2 path (firewall/NAT blocking
  7844 hurts tunnel redundancy).
- Boot-path proof requires one deliberate reboot; not yet performed.
- The promoted build is deployed; no visual screenshot of the compact
  stakeout strip under a real (authenticated, Pro) session has been captured
  yet — the strip is unit/type/lint-verified only.
- Phone-reported ±115 m GPS accuracy is honest product behaviour, but the
  stakeout guidance must never read as survey acceptance; the disclaimer now
  sits on the strip title rather than a paragraph.
