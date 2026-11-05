# Authenticated field-to-office workflow

Approved in chat on 5 November 2026: field crew saves observations; an office reviewer sees the same saved data, records review/corrections, and produces a revision-linked draft deliverable. Presence/chat must use authenticated project rooms, roles must be enforced, and reconnects, unrelated-user rejection and viewer-write rejection must be tested before capture. The subsequent request includes real Desktop account recognition. The X walkthrough is already published; do not repost it.

## Authoritative data and professional boundaries

The existing PostgreSQL observation, immutable surface-revision and deliverable registers remain authoritative. Network messages announce saved changes and carry bounded chat/presence, never replace survey rows or rewrite receipted raw observations. A correction is a new attributed record referencing its source. A review binds a particular saved source hash and revision; changed sources make it stale. Internal review does not imply independent-surveyor, field, statutory, receiving-CAD or calibrated-print approval. CRS and height evidence are retained without automatic conversion or guessed references.

## Project access

Resolve ownership plus canonical organization/project membership through existing request-scoped RBAC/RLS. Unknown roles and unassigned legacy projects fail closed. Owners and recognized editing roles may submit observations and review notes; viewers may read but cannot send edits, review commands or chat. Owner/authorized management actions alone may change membership, with existing seat limits and audit records. No production account, membership, plan or billing change is authorized merely by synthetic QA.

## Live connection

Use the existing collaboration service with short-lived signed room grants bound to user, project, role and expiry. Verify an explicit protocol-version acknowledgement before showing Connected. The server validates bounded messages, stamps the authenticated sender, enforces grant expiry, limits payload/rate, cleans up idle sockets and broadcasts current presence on joins/leaves. Heartbeats keep an idle connected reviewer present. Reconnect obtains a fresh grant, deduplicates messages and reloads authoritative saved records. A configured same-origin secure WebSocket route must be proven; never silently enable public or ID-password WebRTC rooms as a substitute.

The client exposes callbacks as hook inputs, not private inaccessible refs. Cleanup removes observers/listeners/timers and old project/account state. Notifications invalidate cached reads only; HTTP authorization governs every fetch and write. Account switches never reuse another account's chat or local survey queue.

## Durable review and delivery

The team workspace shows role, crew, observation provenance, reference evidence, saved surface revision/hash, review status and deliverable revisions. Review/correction submission checks current access, expected source hash and an idempotency identifier inside the database transaction. A stale review is rejected with a refresh/review action. Append-only audit events retain actor/time/reason. Existing registered files retain their bytes and recovery behavior. Reviewed deliverables still display COMPUTED DRAFT until the separate professional issue gates are met.

## Desktop account recognition: separate delivery increment

Current Desktop licensing deliberately reports UNCONFIGURED, while its older sync login expects a token from an incompatible Web callback. Do not relabel either as authenticated. Add browser-based account authorization in the external browser, using a one-time expiring challenge with public-client proof and explicit scopes. Keep credentials and any session secrets in the main process, not renderer/localStorage. Use exact HTTPS production origins, validated responses, no credential-bearing redirects, no embedded client secret and no TLS weakening. Read the actual user, current subscription and authorized project summaries from the Web service. Show verification time and expiry, and clear identity on sign-out, invalidation, expiry or account mismatch. Preserve offline local computation; no offline lease, seat count, sync or signed entitlement is invented.

Follow RFC 8252 external-agent guidance and the reviewed authorization flow; device-grant polling, if chosen, must implement expiry, interval, slow_down, denial and one-time exchange semantics from RFC 8628. Record an ADR before extending the Desktop IPC allowlist. Browser-side approval of new account access is a concrete user-controlled final step after source testing. This feature is not automatic geometry synchronization.

## Acceptance and preservation

Use isolated QA with three distinct synthetic identities (crew, reviewer, viewer) and an unrelated account. Exercise UI actions from separate sessions: save, office retrieval, review/correction, stale-write conflict, reconnect, viewer/unrelated denial, exact revision export and byte-identical recovery. Retain evidence from both clients and authoritative records. Then separately verify the real Enterprise account in Desktop with read-only account/project access. No production customer observation, drawing, membership or billing change is part of the demo. Keep current application 7290f5c4/image 20a3f3c2 distinct until one gated promotion is verified.

Existing production verification passed; original 129 migration hashes and retained data must remain unchanged. New SQL must be forward-compatible and tested through the existing isolated rehearsal and recovery contracts before one candidate build/promotion. Keep original Desktop dirty work, staged frontend deletion, portable-bundle edits and geodesy helpers intact. No extra application container, worktree, builder or blanket cleanup.

## References

- Initial concrete gaps: docs/COLLABORATION_SOURCE_AUDIT_2026-11-05.md.
- Native authentication: https://www.rfc-editor.org/rfc/rfc8252 .
- Device authorization: https://www.rfc-editor.org/rfc/rfc8628 .
