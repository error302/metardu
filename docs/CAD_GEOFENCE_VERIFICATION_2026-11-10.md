# CAD workspace and site geofence verification

10 November 2026. Checkout base `5194fc29e0498582142719e6a44ee73891a1d36f`. The manifest below identifies the source and regression tests in the shared working tree. This increment has no production deployment or migration record.

## Operating workflow

- In standalone CAD, open **Sheets** to choose Blank Sheet, Sample Lot or Bomet Scheme. Loading a sheet requires confirmation before it replaces the browser draft. **Hide drawing tools** collapses the sheet menu and the upper CAD controls. The canvas and floating camera controls remain available.
- In **Tools → Geofencing & Site Alerts**, click the radar or enter a test easting and northing. The standalone tool starts with an example layout and waits for a position. The amber band marks the inward warning buffer, and the red circles show exclusions. Use a temporary excavation or an individual obstruction as a circular exclusion.
- For site work, open **Site geofence** in the project workspace. Access and the metre grid come from the existing project reference endpoint. Paste a reviewed perimeter in grid coordinates, apply the perimeter and buffer, and add any circular exclusions. Coordinates are supplied in perimeter order. The tool rejects malformed, degenerate and crossing rings. Project extents and arbitrary observations do not supply a perimeter.
- For an uncalibrated WGS 84 UTM project, verify the applied setup and explicitly start device monitoring in a visible tab. The monitor treats the device's accuracy as an estimate and withholds a definite perimeter crossing if that estimate reaches the perimeter. Fixes expire after 15 seconds. Returning to a visible tab requires a fresh fix. Test and enable audio and vibration individually on supported devices.
- Configuration and the latest 200 alert transitions are held in the browser session. CSV records include UTC, source, project ID and CRS when available, position, accuracy, buffer and status. Export before leaving if the session needs a record. Project-wide configuration, shared incident history and corridor or polygon exclusions remain outside this increment.

The former legal badge cited Regulation 20, which covers conduct of examinations. The geofence provides advisory position estimates. [Kenya Survey Regulations](https://new.kenyalaw.org/akn/ke/act/ln/1994/168/eng%402024-01-19/source.pdf), [W3C Geolocation](https://www.w3.org/TR/geolocation/).

## Verification

- The focused Jest run passed 71 tests in six suites. Application, test and tooling TypeScript checks, scoped ESLint and the working-tree diff whitespace check passed.
- The existing isolated host preview at `127.0.0.1:3021` showed all three starter choices in the CAD sheet menu. Collapsing the toolbar increased the visible canvas height from 250 px to 380 px at the tested viewport. The Fit drawing button remained available and expanding restored Sheets. No sheet was loaded in the browser check. The regression test checks that cancelling a template replacement preserves the stored synthetic drawing.
- In the same preview, the standalone geofence classified the supplied sample coordinates inside the perimeter and recorded a labelled simulation alert at the example exclusion centre. A crossing perimeter was rejected. An unauthenticated synthetic project link returned the project-access message and provided no monitoring controls. The synthetic browser check did not use the user's localhost training origin.
- Focused regression coverage includes metre-grid reference access, mocked device fixes and position accuracy, stale-state expiry, permission denial, tab visibility, invalid geometry, local draft retention and existing CAD exports. Mocked browser APIs exercise the watch lifecycle without establishing GPS hardware behavior.

## Open acceptance gates

Physical positioning, cross-device audio and haptic behavior, movement and signal-loss drills on a reviewed site, independent surveyor and site-safety acceptance, and any provider or calibrated datum integration require separate evidence. Existing provider, security-deferral, backup/restore and release approval gates remain open. This work made no customer data or production runtime changes.

## Source manifest

SHA-256 of working-tree file bytes.

| File | SHA-256 |
| --- | --- |
| `src/app/project/[id]/ProjectWorkspaceClient.tsx` | `c7c8a2cc32d2de92414353ac29de2db067087741a6b94b296b24beb1bd73b4f5` |
| `src/app/tools/cad-editor/page.tsx` | `3d255f8d0fa6a2374cfc402b43fe186a762ab1b2b021aa11856a3f037378c2f8` |
| `src/app/tools/geofence/page.tsx` | `c7b355d0e810449d4ff3e9214e621ab09e90549c8d76e8a8760b180ad99c3351` |
| `src/app/tools/page.tsx` | `79231378f78bba20ae623e6e0e182d62ad004bb59d35783864c0d1faee859ee9` |
| `src/components/cad-editor/CADEditor.tsx` | `7d2f8dfc5da40ac2781552fb0ecb2d9d64dc42cdc3f63d4445308257a6378f45` |
| `src/components/survey/GeofenceMonitor.tsx` | `59b932fb1c73a1da9431f9dc49231e76419cbb76a1d3355b115e937039ab2aea` |
| `src/lib/survey/geofenceEngine.ts` | `58d12fd9c6a4c5e223a86ef2b9bf09a207a21201f50da2e065d3eeda7d62b462` |
| `src/lib/survey/geofencePosition.ts` | `e22700557b25578182ce0bfdd95a3f9bee0e744ab7f949b56eef5b7433d4327a` |
| `src/lib/survey/__tests__/geofenceEngine.test.ts` | `e927ab6686606b823950eb4274044d52581cbaa5fef6107dd363847ee42bf3d7` |
| `tests/geofence-monitor.test.tsx` | `9a26dfe2bccf52660eee1f4dd5c5d6e41004ca352b1555e72670841be626824a` |
| `tests/standalone-cad-workflow.test.tsx` | `cee4cf5185a88c1867d18498e016949bf77e954ab1a7238e792cddd563d03419` |
