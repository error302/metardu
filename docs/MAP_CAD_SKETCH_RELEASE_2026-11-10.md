# Map and CAD sketch verification

10 November 2026. This increment starts from source `5194fc29e0498582142719e6a44ee73891a1d36f` and the inspected production application `8641e4e25035f1eb1ad510033869b264f1e10e10` (`sha256:135cc0fdeada753687de13a87609c5d05bf52c5fbc7d30a59fa3a8a52e4b8840`).

## Behavior and source checks

- Map Capture closes its panel when Line, Polygon, Distance or Area begins. A compact strip keeps Finish and Cancel reachable. Area closes on a double-tap at the last vertex or at the starting point after three vertices. Line can finish by double-tap or the Finish line button. Completion detaches the interaction so the next tap navigates or identifies as usual. The temporary measurement and its result remain visible.
- CAD displays the loaded starter name beside Sheets. Its close button hides the shortcut without modifying the canvas or draft. It stays hidden after refresh. Loading the starter again or opening a valid CAD file with its marker restores the shortcut. Older training files are recognized by their original sample title and LR label. The training templates remain available in Sheets.
- Focused Jest passed 96 tests across 11 suites, including OpenLayers mouse and simulated touch input, separated rapid taps, draft completion and CAD reimport. Application, test and tooling TypeScript checks and scoped ESLint passed.
- In the isolated browser at `127.0.0.1:3021`, choosing Area exposed the canvas. A pointer double-click completed the synthetic area, displayed 379.76 m², and left the result unchanged after another map click. Finish line exited sketch mode and created an undoable line. Dismissing the Bomet shortcut preserved the current 19-point/20-edge synthetic drawing. Loading the starter again restored the shortcut and showed the 10-point/11-edge template. CAD file reimport was exercised by the regression test. The browser checks used the owned preview origin.
- This release scope also carries the pending Map appearance, editing and capture changes, CAD input, drafting and export changes, geofence, and diagnostics changes reviewed in the preceding source checks. No migration source is changed.

## Release and acceptance

The initial read-only Docker check reported one application container, healthy application and required services, and a successful matching migration service. The backup job recorded completion at 9 November 2026 20:03 Nairobi. This is archive evidence. A fresh customer/offsite restore, physical touch and GNSS acceptance, independent surveyor approval, provider checks, security deferrals and the broader release gates require their own evidence.
