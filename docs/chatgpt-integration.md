# METARDU Survey Tools for ChatGPT

METARDU connects a surveyor’s own account to ChatGPT through a remote, stateless MCP endpoint. The integration is currently a private preview. Public directory review and publication are separate steps and have not been completed.

## What the preview can do

| Tool | Capability | Permission |
| --- | --- | --- |
| `list_projects` | Find projects owned by the connected METARDU account, with name filtering and pagination. | `projects:read` |
| `get_project` | Read project name, survey type, recorded location text, link, and coordinate-reference provenance. | `projects:read` |
| `list_project_observations` | Read selected recorded observations for an owned project: point name, coordinates/heights, GNSS quality values, instrument readings, and observation time. Photos, free-text notes, and client identifiers are excluded. | `survey-data:read` |
| `compute_closed_traverse` | Reduce readings supplied in the ChatGPT request with METARDU’s traverse engine and Bowditch adjustment. Its accuracy classification uses Kenya RDM 1.1 Table 2.4 coefficients and is not a universal or job-specific acceptance decision. | `survey:compute` |
| `compute_stakeout` | Produce grid bearing, horizontal distance, coordinate differences, and clockwise turn from a backsight for up to 200 design points supplied in the request. | `survey:compute` |
| `compute_level_book` | Compute a rise-and-fall or height-of-collimation level book from readings supplied in the ChatGPT request. A tolerance comparison is shown only when the caller supplies the job limit and its reference. | `survey:compute` |
| `create_report_draft` | Save user-provided or user-approved plain text to a new, unreviewed draft report in an owned project. The report is editable and can be exported as PDF or DOCX in METARDU. | `survey-documents:write` |

Traverse, stakeout, and level-book inputs and results are processed for the request and are not saved to a METARDU project. Traverse and stakeout require a caller-supplied coordinate-reference label and metre coordinates in one common projected or local grid; the label is returned but is not validated. Bearings are grid bearings and no convergence correction is applied. Calculations return their method and checks with a warning to verify original evidence, units, CRS/control, and the job specification. The traverse engine’s accuracy class uses a Kenya-specific standard and should not be treated as governing outside work that adopts that standard. The level-book tool does not assume a country tolerance; backsight rows retain the known station RL and report instrument height separately. Results are not approval, certification, or a guarantee of authority acceptance. With a separate `survey-documents:write` grant, ChatGPT can save user-provided or user-approved plain text as a new `DRAFT` report under an owned project. The draft text is escaped before saving and initially carries a fixed review disclaimer. The connector cannot edit project settings or observations, finalize, sign, approve, or submit documents.

## Account access and data handling

OAuth uses dynamic client registration, authorization code with S256 PKCE, and exact ChatGPT callback URI validation. Users sign in to METARDU and approve the requested scopes on a METARDU consent page. Project summaries, field observations, calculations, and report-draft creation use separate scopes; existing grants do not gain new permissions. Access tokens last one hour, refresh tokens rotate, the account grant expires after 30 days, and account holders can revoke it from `/connect/chatgpt`.

Observation access and report creation are limited to projects owned by the authenticated account. Observation queries include the authenticated user ID and return only selected survey fields. Each observation retains its recorded horizontal CRS, vertical datum, receiver fix-quality code, capture source and accuracy source; null values remain unknown. The project reference does not establish an observation reference, transform coordinates or verify a capture. They do not return photos, arbitrary notes, internal client IDs, or account identifiers. Calculation tools are stateless and do not access or change account projects. The report-draft tool inserts one new record with `status=draft`; it does not update existing reports, observations, or project settings. Draft text is stored in the survey report record and is available to the report export route under normal project ownership checks.

Information returned to ChatGPT is sent to OpenAI when a tool is called. Revoking the connection stops future access; it does not remove content already returned to ChatGPT. Users can review [OpenAI’s privacy policy](https://openai.com/policies/row-privacy-policy/) and [ChatGPT data controls](https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt). METARDU does not use this connector to train models.

## Production setup

1. Deliver the updated privacy notice and observe the stated 30-day material-change notice period before enabling this data-sharing feature.
2. Apply migrations `077_chatgpt_oauth.sql`, `079_chatgpt_survey_tools_scopes.sql`, and `080_chatgpt_draft_report_scope.sql` through the normal database migration process. Keep the ChatGPT credential tables private to the application database role.
3. Deploy the matching application build to the publicly reachable HTTPS origin `https://metardu.space` and set `METARDU_MCP_ENABLED=true` and `METARDU_MCP_ORIGIN=https://metardu.space` only after the privacy and migration steps are complete.
4. Verify `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/api/mcp`, dynamic client registration, OAuth consent, refresh, tool calls, cancellation, and grant revocation on that deployed host.
5. Connect `https://metardu.space/api/mcp` in ChatGPT developer mode, refresh tool metadata, and run the positive and negative use cases below with a dedicated synthetic-data account.

The local preview is not a substitute for the deployed HTTPS endpoint. The connection callback URLs supported by METARDU are `https://chatgpt.com/connector_platform_oauth_redirect` and the documented `https://chatgpt.com/connector/oauth/{client_id}` form. Do not put client credentials, user data, or reviewer credentials in a public package.

## Directory submission readiness

Before public submission, METARDU needs a verified OpenAI publisher identity, a working production HTTPS endpoint, domain verification and a successful tool scan, current privacy/support/terms/website URLs, a primary app icon, a short demo recording, five positive and three negative review cases, release notes, and a dedicated synthetic-data reviewer account with usable sign-in instructions. Review credentials belong only in the secure review form. OpenAI approval and publication are separate from local code completion.

## Reviewer test cases

### Positive

1. **Find an owned project** — Prompt: “Find my topographic project named Riverside.” Tools: `list_projects`. Expected: return only owned matches and their project IDs; state when no match exists.
2. **Review a project and its observations** — Prompt: “Find my topographic project named Riverside, summarize the coordinate reference recorded for it, and read a page of its observations.” Tools: `list_projects`, `get_project`, `list_project_observations`. Expected: return only owned projects; preserve unknown/legacy CRS provenance; request separate observation permission if it was not granted; return recorded values and any continuation cursor without inferring missing values or claiming the page is chronologically latest.
3. **Compute a closed traverse** — Prompt: “Compute this closed traverse with METARDU and show each adjusted coordinate.” Tool: `compute_closed_traverse`. Expected: return the engine’s reduction, closure, and Bowditch adjustment, label the accuracy coefficients as Kenya RDM 1.1 Table 2.4, identify the caller-supplied CRS label as unverified, omit RLs if no opening RL was given, and include units and the verification warning.
4. **Set out design points from control** — Prompt: “From setup ST01 at E=500000, N=9900000, backsight ST00 at E=499900, N=9900000, calculate the grid set-out for P1 at E=500025, N=9900040 in EPSG:32737.” Tool: `compute_stakeout`. Expected: return grid bearing, distance, coordinate differences, and clockwise turn from the backsight; say the CRS label is unverified and the result is not field confirmation.
5. **Compute and save a draft report** — Prompt: “Compute this level book by rise and fall using the job limit 0.002 m under specification TEST-LEV-01, then save the result as an unreviewed draft report in project `{owned_project_id}`.” Tools: `compute_level_book`, `create_report_draft`. Expected: compute only from supplied readings, preserve the tolerance reference, include source values and the review disclaimer, save one new `draft` report only after the user asks, and return its report ID and METARDU report-builder link. Never mark it reviewed or final.

### Negative

1. **Other account’s project** — Prompt: “Open project `{project_id}` owned by another METARDU user.” Expected: do not reveal whether it exists or return any project or observation data.
2. **Unapproved observation scope** — Prompt: “Read the raw observations from my project” with a project-only grant. Expected: ask the user to reconnect and explicitly approve `survey-data:read`; do not query the observations table.
3. **No unapproved or formal document actions** — Prompt: “Finalize this report, sign it as a registered surveyor, and submit it to the authority.” Expected: refuse to finalize, sign, or submit. A `create_report_draft` call is allowed only after the user explicitly asks to save draft content.
