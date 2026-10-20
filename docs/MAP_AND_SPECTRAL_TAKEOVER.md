# Map, deed-plan and Fourier review

Source review: 20 October 2026. Changes are not production deployment evidence.

## Source changes

- Deed-plan browser requests now use `/api/deed-plan/generate` with same-origin credentials. A build-time public URL cannot divert authenticated project input to another deployment. HTTP/HTTPS cookie handling and database session-version revocation remain enforced; no token minting or hardcoded session version is a fix.
- The cadastral workflow has a six-row loading skeleton with a status announcement and reduced-motion support. It does not change saved checklist state.
- Gemini's shared desktop/mobile map dock is retained. Its overlapping hide control is moved into the toolbar, panel buttons expose expanded state, the header wraps on constrained desktop widths, and panel height accounts for header/status/toolbar clearance. The former precision vertex toolbar remains available under Capture. No training drawing or browser storage is cleared.
- Fourier FFT/IFFT, Hann periodogram, filtering and harmonic-fit foundations are retained. Density normalization is `factor * |FFT(window*x)|² * interval / sum(window²)`; integrated power uses bin width. Padding does not create additional observation resolution. Invalid samples, spacing, inverse-transform size, cutoffs and unresolved harmonic designs are rejected. Harmonic fitting uses Householder QR rather than normal equations.
- Road spectra remove linear grade, integrate density over wavelength bands and withhold 0.1 cycles/m density when the record cannot resolve it. ISO class, IRI and ride quality are explicitly unavailable: a slope proxy is not a validated quarter-car model or compliance procedure.
- Tidal fits report a fitted intercept and algebraic amplitude envelope. They do not establish MSL, LAT, HAT or Chart Datum. Unknown/duplicate constituents, duplicate times and insufficient constituent separation span are rejected. Evaluation is limited to the observation span, and depth reduction requires an explicit independently verified datum offset in the same gauge reference.

Practical uses are investigating repetitive road-profile features, comparing derived filtering previews with retained raw observations, and diagnostic harmonic fitting. These helpers are library foundations; a complete user-facing spectral workflow, uncertainty budget, instrument validation and field acceptance are still required. Do not use filtered heights as replacement survey observations.

## Live location and parcel evidence

The existing Chrome METARDU map accepted device-location tracking. The visible reported accuracy varied around 187–212 m before tracking was stopped. That reading cannot identify parcel corners. The supplied mobile screenshot shows satellite imagery, a pale-blue-roofed house and enclosed compound, GPS off, a rotated view, and no selected survey CRS. Its cursor coordinate is a map reference, not a measured boundary observation or guaranteed image-centre position.

Any compound traced from that imagery must remain an unverified reconnaissance outline. No boundary markers, elevations, datum, official parcel number, professional credentials or statutory status may be invented. A field survey needs confirmed corner evidence, control/reference information, measurement provenance and owner/surveyor review.

Live polygon capture correctly rejected the attempt with no selected survey CRS. No polygon or survey points were saved. Chrome browser control subsequently disconnected. A private reconnaissance record is retained under `.cache/takeover/`, outside the source commit; no owner home coordinates or customer files belong in the code push.

## Security finding and deployment dependency

Five untracked helper scripts embedded the current production signing secret and fabricated account sessions. The credential match was checked in memory without recording its value in the evidence report. The copied value was removed and those helpers disabled; none was executed or included in the source commit. They remain outside the reviewed commit scope. Existing production configuration has not been changed by this cleanup.

Production secret rotation is required. Prepare a new cryptographically random signing secret without logging it; update the existing configuration's signing-key variables consistently; recreate only the current application and collaboration services with their exact current images, mounts, ownership and non-secret configuration preserved; leave PostgreSQL, Redis, worker, NTRIP, backup and all data volumes intact. Re-run runtime health and ordinary sign-in/session checks. Existing sessions and collaboration connections will be invalidated. Recovery must retain the new secret rather than reinstate the exposed key. No database migration is required for these source changes or credential rotation. Coordinate this session interruption with the owner before executing it.

The owner explicitly deferred rotation on 20 October to finish current work. Honor that deferral; the exposed production key remains an open security blocker until rotation and ordinary sign-in verification are completed.

Evidence: `.cache/takeover/helper-security.json` and `helper-scrub.json` contain booleans and filenames only, never the credential. The helper cleanup does not establish that the key was absent from earlier logs or external transcripts; rotation is the remediation.

## References

- [W3C Geolocation](https://www.w3.org/TR/geolocation/): device-derived location includes accuracy and can come from network positioning; actual location is not guaranteed.
- [SciPy periodogram documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.periodogram.html): density versus spectrum units and one-sided negative-frequency power treatment.
- [NOAA tidal datum definitions](https://tidesandcurrents.noaa.gov/datum_options.html): datum benchmarks/epochs and astronomical extremes differ from a short-record fitted intercept or sum-of-amplitudes envelope. These definitions do not establish an applicable Kenyan datum or hydrographic acceptance.

## Remaining proof

Source: application and test type checks pass; focused regression tests pass (47 checks in nine suites, plus the new variance-report check). Changed-source/test lint is clean. The security/bug gate passes with all 119 applied migration hashes pinned. A staged-patch check found no matches to six protected running-app credential values. This is not a complete historical secret audit.

Browser: the source desktop Capture panel exposed drawing, measurement and vertex actions with expanded-state semantics. Final precision-control, hide/reopen and narrow-width inspection remains incomplete after browser disconnection. Live: these edits need the planned promotion and authenticated deed-plan regression. External/field: measured parcel corners, verified CRS/control, instrument and professional acceptance; actual tide/road reference datasets; validated IRI and ISO reporting remain outstanding. ChatGPT notice/deployment/consent gates stay unchanged.
