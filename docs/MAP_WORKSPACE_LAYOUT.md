# Map workspace layout

Source preview implementation, 16 October 2026. Production promotion remains a
separate release gate. The user's supplied map image is a layout reference;
its illustrated layers, elevations and RTK solution are not project data.

## Arrangement

- Keep primary site navigation above the map. Search and survey CRS selection
  share a compact workspace header. Desktop pointer coordinates appear beside
  search, with the complete available readout in the bottom status strip.
- Place basemap choices below the header, survey tool groups down the left, and
  zoom, north reset and print at the lower right. Desktop panels open one at a
  time; layer management opens on the right.
- Group layers into Base, Survey and Reference. Retain downloaded basemap
  selection, opacity, project scheme controls and contextual OSM footprints.
  Only linked projects can load their scheme data. Existing scheme loading,
  error, visibility and traverse workflows use their existing component.
- On phones, use two rows of three tool groups and a single scrollable panel,
  above the status strip and site navigation. The gesture lock sits beneath
  panels so it cannot cover a field. Keep the scale and attribution reachable.
- Read the actual OpenLayers basemap visibility for both selectors, including
  downloaded maps, rather than presenting a stale selected basemap.
- Report browser location accuracy as device accuracy. Do not invent elevation,
  RTK status, control verification, cadastral coverage or loaded project layers.

## Repairs found during verification

Decimal coordinate search silently swapped documented latitude/longitude input.
It now retains latitude first and rejects malformed/nonfinite/extra values and
out-of-range geographic pairs. For example, `-1.286389, 36.817223` now reaches
Nairobi. Easting/northing search still requires an explicit survey CRS.

The old five-second timer marked the map ready before initialization completed.
Controls could mount without a map instance and never attach their listeners.
Only actual initialization now enables tools; the shared logo loading state
remains visible until then. Retry reloads the route rather than just clearing
an error without rerunning the mount-only initialization effect.

## Evidence and limits

CUA checks used the existing source server at `127.0.0.1:3021`, an isolated
agent tab and a temporary 390 × 844 viewport, restored afterward. Checked the
desktop and phone layouts, layer group switching and unlinked-project guidance,
basemap selector synchronization, coordinate navigation to Nairobi, and expanded
OpenStreetMap attribution. Screenshots are in the ignored
`.cache/release-verify/map-workspace/` directory. No CAD drawing was edited.

The existing seven map/CRS/GPS/engine suites passed 70 tests. Nine new coordinate
search regressions passed after reproducing the old failures. One additional
regression passed against actual OpenLayers layer/collection visibility events,
including cached-layer additions and removals. Strict app/test typing and scoped
ESLint also passed; the push hook runs the applicable checks again.

The existing production verifier passed with one healthy application container.
No new image, builder, application container or production migration was created.
This layout proof does not establish receiver, field tolerance, cadastral
authority, live paid/provider flows or full platform readiness. The source
preview also logged a NextAuth client session-fetch error; a separate quantity
verification rerun encountered credential rejection. Those source authentication
issues remain under investigation and are not treated as successful live login
or OAuth evidence.
