# METARDU ChatGPT MCP review notes

Use these statements when the OpenAI submission form asks why each tool has its published safety annotations. They describe the current server behavior; re-check the dashboard's scanned values before submitting.

Six tools declare `readOnlyHint: true`, `destructiveHint: false`, and `openWorldHint: false`. They retrieve selected data from the connected user's METARDU account or calculate from values supplied in the ChatGPT request. `create_report_draft` declares `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, and `openWorldHint: false`: it creates one new `draft` report record only when the user asks, never updates an existing record or project settings, and does not sign, finalize, approve, or submit. Account-data reads and draft writes enforce the connected user ID in their database queries. Calculation inputs and results are not saved.

## Tool-specific rationale

- `list_projects`: reads a bounded page of projects owned by the connected account. It does not search public or third-party sources and does not change project data.
- `get_project`: reads one project summary only when it belongs to the connected account. It does not modify project or CRS records.
- `list_project_observations`: reads selected observation fields only for an owned project and only with the separate `survey-data:read` grant. It does not return photos or arbitrary notes and does not change observations.
- `compute_closed_traverse`: performs an in-memory calculation from request values. It does not save the traverse or contact an external source. Its Kenya RDM accuracy label is informational and is not a job acceptance decision.
- `compute_stakeout`: performs in-memory inverse calculations from request coordinates. It does not save stakeout points or connect to an instrument. The caller's CRS label is not validated, and the tool does not apply grid convergence.
- `compute_level_book`: performs an in-memory level-book calculation from request values. It does not save readings or choose a tolerance; any comparison uses the limit and reference supplied by the caller.
- `create_report_draft`: stores plain text supplied or approved by the user as a new unreviewed draft report in an owned project, using a separate write permission. It escapes the content before saving HTML-backed report sections and appends a fixed professional-review disclaimer. It cannot update other records or change the draft status.

## Still required outside this code package

The package does not contain reviewer credentials or a demo-recording URL. Before public review, deploy and verify the HTTPS MCP/OAuth endpoints, complete domain verification using the exact portal-generated challenge token, test the reviewer account with synthetic project data, record and host the walkthrough, verify the publisher identity, and complete the OpenAI review and publication steps. No production deploy, privacy-notice delivery, database migration, or public submission is represented as complete by these local files.
