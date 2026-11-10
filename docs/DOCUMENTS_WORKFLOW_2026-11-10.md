# Documents workflow and verification — 10 November 2026

## Where to work

| Tool | From Project → Documents | Standalone |
| --- | --- | --- |
| Survey Report | Start or reopen a saved report. Generate a preview, edit sections and save the current revision; PDF and Word use that saved revision. | Choose a project first. |
| Deed Plan | Use the declared grid and a saved ordered boundary whose observation evidence is current. When that evidence is missing or stale, enter an independently checked boundary in order. | Enter ordered coordinates and explicitly confirm the datum, zone and hemisphere; preview, SVG, PNG and A3 draft print. |
| RIM register | Create and reopen a section, add parcels and beacons, export the schedules as a draft PDF. | Choose a project first. For a scheme index map, use the scheme workflow; a register PDF is not a map. |
| Beacon Certificate | Enter or transcribe checked beacon records in the manual tool. Project point linking remains a follow-up because a coordinate alone does not establish mark condition. | Enter the reference and complete named coordinate pairs; print an unsigned draft or download CSV. |
| Survey Review Workbook | Build a review copy from project boundary and computation evidence. Missing evidence blocks the export. | Download a blank template without sample coordinates or a claimed QA pass. |

Field Book remains the observations workspace. It is no longer a duplicate tool on the Documents hub.

## Workflow state audit

Reproduce the source inventory with `node scripts/audit-workflow-state.mjs`. It walks application routes, components, hooks, libraries and stores with the TypeScript parser; it reports owner, file, line and lifecycle signal. Initial scan: 2,865 source files, 367 code units with signals, 218 with two or more. These are candidates, not 218 confirmed bugs. It finds component and reducer declarations; server jobs, service workers, SQL transitions, dynamic plugins and unnamed booleans also require review of their owning modules.

| Workflow | Transition to make explicit | Disposition |
| --- | --- | --- |
| Documents search and navigation | Empty query → filtered results → zero results; project chooser → bound tool | Implemented. Search is keyboard accessible. Main actions share the app palette; 180 ms entrances, 30 ms row stagger, shorter exit transitions, reduced-motion support and 97% press feedback apply where useful. |
| Survey Report | Load → edit → preview → save acknowledgement → export that ID; failure or newer edit returns to the draft | Implemented. One operation state, request exclusion and edit revision checking. Exact saved sections are the export contract. |
| RIM register | Choose project → list → open detail → edit or add → reload → export | Implemented. Reads and appends are owner scoped; late detail responses cannot overwrite a newer selection. Keep official map assembly separate. |
| Deed Plan | Reference checked → simple ordered ring → preview for current input → export or save; a later edit invalidates preview | Implemented. A fitted print uses the declared grid and includes continuation pages for longer schedules. It does not establish print scale or field closure. |
| Beacon Certificate and Workbook | Incomplete inputs or missing evidence → actionable feedback; valid draft → export | Implemented. An empty workbook stays unverified. Certificate print requires complete rows and a stated reference. |
| Identity and access | Session loading, anonymous, eligible, forbidden, expired; distinguish retry from permission denial | Follow-up: unify reason codes and permission recovery across web and API. |
| Field Book, GNSS, NTRIP and sync | Capture pending, committed locally, queued, acknowledged, conflicted, rejected; stale receiver fixes distinct from disconnected | Follow-up: use one event vocabulary with observation ID and timestamp across offline, devices and agent tools. Physical checks remain required. |
| Map, CAD and import | Tool mode, gesture in progress, validation, commit, undo; imported candidates distinct from saved geometry | Follow-up: reuse transition contracts across pointer, keyboard, touch and agent actions; add interruption and focus-loss cases. |
| Computation and submission | Run current, changed source, recalculation needed, review requested, accepted, superseded | Follow-up: reuse immutable source revision and reason codes across calculations, exports and release evidence. |
| Collaboration, billing and background jobs | Invite pending/accepted/revoked, reconnect/snapshot/replay, provider pending/confirmed/failed, job retry/failure | Follow-up: make external acknowledgement authoritative; verify against real provider and reconnect cases. |

UX benefits from clear recovery and visible status. DX gets typed transitions, a shared export block reader, and a repeatable audit. AX gets stable project/report identity, owner-scoped actions, explicit rejection, and no need to infer success from a screen or file button.

## Evidence and gates

Source change has no SQL migration. RIM register drafts use a distinct discriminator in the existing report table; the legacy scheme and RIM cache tables are left intact. The active production schema contained those legacy tables; the original register handler addressed different columns. An isolated loopback database and two synthetic accounts verified RIM create/update/add/reopen/PDF, Survey Report save/load/list/PDF/Word, foreign account denials, valid Deed Plan SVG, rejection of crossed geometry, a blank workbook and the missing-evidence rejection. The browser verified Documents search, the project document links, the standalone Deed Plan preview and export controls, and Beacon Certificate input gating. Focused tests include report content, deed output and submission provenance.

This is draft-document workflow evidence. Independent surveyor review, authenticated land-authority acceptance, physical field and device checks, provider and security deferrals, and a customer/offsite restore remain separate gates. Record any production image digest and cutover evidence in the release receipt for the committed revision.
