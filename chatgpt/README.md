# METARDU Survey Tools for ChatGPT

This folder contains the portable Agent Plugins package for the METARDU remote MCP server. Version 0.4.0 adds a separately permissioned, draft-only survey report writer alongside project discovery, field observation reading, and survey calculations. The package targets `https://metardu.space/api/mcp` and remains a private integration preview; the production endpoint and OpenAI listing are not confirmed as live.

## Before using this package

1. Deliver the ChatGPT data-sharing notice in the privacy policy and wait the stated 30-day material-change period. Keep `METARDU_MCP_ENABLED` off until that is complete.
2. Apply the OAuth and scope migrations through the normal database process, including `077_chatgpt_oauth.sql`, `079_chatgpt_survey_tools_scopes.sql`, and `080_chatgpt_draft_report_scope.sql`.
3. Deploy the tested application build to the public HTTPS origin, enable the MCP endpoint, and verify OAuth discovery, consent, refresh, permission errors, tool calls, and revocation with synthetic data.
4. Connect the deployed endpoint in ChatGPT developer mode and exercise every positive and negative review case in `metardu-surveyor-tools/plugin.json`. The coordinate-reference labels provided with calculation inputs are not validated; test grid bearings, units, closure, level-book arithmetic, draft creation in an owned synthetic project, and permission denial with synthetic data.
5. Create a dedicated synthetic reviewer account, record an accessible product walkthrough, verify publisher identity and domain ownership, then upload the package and complete OpenAI review and publication in the developer dashboard.

The package intentionally contains no reviewer credentials or demo URL. OpenAI requires an accessible walkthrough and usable test account before submission; do not replace these with placeholder values.

`plugin.json` follows the portable Agent Plugins schema. `mcp.json` declares a Streamable HTTP server. The icon copied into `metardu-surveyor-tools/assets/` is the current METARDU brand icon. Copy the annotation justifications from `docs/chatgpt-review-justifications.md` into the submission review form if it requests them. The exact domain challenge token must come from the OpenAI portal and must not be guessed or committed to this package.
