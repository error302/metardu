# Road workspace benchmark and delivery priority

Inspected 26 October 2026 through the signed-in browser. Owner supplied
[Marcin Pszczolka's LinkedIn post](https://www.linkedin.com/posts/marcinpszczolka_one-prompt-30-minutes-2-of-my-tokens-share-7520192499580203008-J_Uk/).
This records observed product presentation and a delivery target, not completed
METARDU functionality or an independent test of the creator's application.

## What the reference shows

The attached CIVILAPP MVP image places editable alignment/PI controls beside
a plan and a terrain/corridor 3D view, with longitudinal profile and cross-section
views below. A station/section selector, geometry element list, terrain/corridor
visibility controls, design tabs and an IFC 4.3 export action share one workspace.
The author describes live alignment editing, dynamic 3D and browser-only delivery.
Only the post and enlarged image were inspected; no runnable app, source or
exported IFC was provided or independently validated.

The actionable benchmark is a coherent visible design cycle: adjust a road,
understand its effect in several representations, and obtain a usable output.
METARDU should demonstrate that complete cycle using retained survey evidence.

## Current METARDU sources inspected

- `src/app/project/[id]/engineering/page.tsx` loads and saves project engineering
  data and hydrates the relational alignment mirror. This saved-project workflow
  is the integration base; do not replace it with another isolated road tool.
- Its existing steps cover horizontal/vertical alignment, section templates,
  stations, field plan, quantities and outputs. `RoadProfilePanel` and
  `LongSectionRenderer` provide existing profile representations.
- `src/app/tools/road-design/page.tsx` presents separate calculator tabs.
  `src/components/engineering/panels/RoadPanel.tsx` explicitly keeps its legacy
  inputs in page state. These are not equivalent to one synchronized visual
  saved-design workspace.
- `src/lib/export/ifc43Alignment.ts` and the project IFC export route already
  exist. Existence and entity-name tests do not establish schema validity,
  exact alignment semantics or receiving-application interoperability. The route
  also needs review of its first-alignment selection and missing-height-to-zero
  conversion before it can support a trustworthy selected-revision road export.
- `TIN3DViewer` and retained civil-surface/export work are available integration
  points, not proof of a live road corridor model.

## Next road delivery target

Prioritize one saved project road through survey/terrain selection, horizontal
alignment, vertical profile, section design, corridor review, quantities and
setting-out/export. Reuse the current computational authorities, declared CRS,
height references, adopted criteria and saved-revision boundaries.

1. Introduce an integrated work view inside the existing engineering workspace:
   a bounded inspector; plan and 3D views above; profile and section below. Use
   professional geomatics symbols. Smaller screens expose a focused view switch
   rather than compressing all panes into unreadable or overlapping controls.
2. Share one selected road revision and station across all views. Plan/profile
   edits, section selection, terrain inspection and numerical schedules must
   refer to that same state. Pending or failed recomputation cannot leave stale
   geometry presented as the current design.
3. Use the actual retained terrain and measured section inputs. Missing terrain,
   levels, setup or criteria remain explicit; do not generate decorative ground,
   fabricated elevations or unearned accuracy/compliance results.
4. Bind changes to durable project save/reload/recovery and clearly distinguish
   unsaved design, saved revision, reviewed result and issued deliverable.
5. Export the selected saved revision through independently checked IFC 4.3,
   LandXML, DXF and setting-out paths as supported. Validate actual files and
   alignment geometry, stationing, units, CRS, heights, transitions, sections and
   quantities. Receiving CAD/BIM, instruments and professional approval retain
   separate acceptance gates.
6. Demonstrate one continuous representative road job: import real survey data,
   adopt control/reference/criteria, select retained terrain, edit design, inspect
   all views, compare quantities, save/reopen and deliver revision-bound files.
   Synthetic fixtures support development; they do not complete the real pilot.

Do not broaden this into another list of disconnected calculators or label the
existing IFC writer production-ready because the reference image has an export
button. Finish the current boundary-recovery checkpoint without mixing road
implementation into that commit, then use this target to order the next road
implementation and acceptance work. Existing security, provider, customer
recovery, worker/candidate and production/field gates remain open.

The first connected review phase is implemented in
`ROAD_VISUAL_WORKSPACE_2026-10-26.md`. Its saved-project and synthetic-example
views do not close the live-editing, retained-terrain, durable road-revision or
validated interchange requirements above. Continue those requirements as the
next road work; retain this complete delivery target.

The next implementation phase is recorded in `ROAD_LIVE_EDITING_2026-10-27.md`:
numeric alignment/profile/template edits now drive the views, and original ground
is withheld when its alignment association changes. Durable draft/conflict
recovery, direct graphical editing, retained terrain, independent ground
reassociation and validated revision-bound delivery remain open.
