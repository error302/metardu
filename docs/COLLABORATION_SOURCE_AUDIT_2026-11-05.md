# Collaboration demonstration: initial source audit

Inspected Web application source 7290f5c4234b2cd94e3c5dfb399c34d074fdd444 on 5 November 2026. No collaboration code, account, membership, browser storage or customer drawing was changed during this audit.

The approved Desktop walkthrough was published first, as requested: https://x.com/itsdosho/status/2118405747184648656 . It does not demonstrate pairing or collaboration.

## Verified existing paths and gaps

1. `src/lib/realtime/index.ts` creates local Yjs/IndexedDB documents and asynchronously attaches an optional WebRTC provider. It does not call the authenticated room-ticket endpoint or the JSON collaboration WebSocket server. Its room password is derived from the project ID. Enabling that optional path is not an adequate authorization design.
2. `subscribeToProjectChanges` and `useCollaboration` read the provider immediately after document creation. A provider attached asynchronously can miss awareness/status listeners. The point observer is not removed by the returned unsubscribe callback.
3. `src/lib/realtime/useCollaboration.ts` holds chat callbacks in a private ref that consumers cannot register. `src/app/project/[id]/ProjectWorkspaceClient.tsx` has an empty incoming-chat effect and only appends locally sent messages. Existing code does not prove two-way team chat.
4. `src/lib/realtime/collaborationServer.ts` verifies short-lived project-bound HMAC room tickets, but its transient JSON protocol is distinct from the client Yjs document. It is not a durable source of field observations, reviewed surfaces or deliverables. Its feature conflict policy is timestamp last-write-wins, not professional review or three-way merge.
5. `/project/[id]/workspace` explicitly filters non-admin access by the owner user ID. A project membership alone therefore does not open that legacy workspace, even though the ticket route recognizes memberships. Topographic export separately requires project ownership. These restrictions must be reconciled deliberately with existing role/RLS contracts, not removed to make a demo appear to work.
6. Current `realtimeSync.test.ts` uses one singleton local Y.Doc and sequential inserts. It does not establish networking, distinct users, reconnect recovery, access isolation, conflicting edits or durable review.

`npm run docker:verify` passed all required services, including collaboration, and verified one application container. A healthy collaboration process does not prove the above browser paths interoperate.

## Required demonstration evidence

Use two separately authenticated synthetic accounts in isolated QA, representing field crew and office reviewer, with the actual project role permissions. Capture a field observation saved through the authoritative API, its office-side retrieval with unchanged coordinates/reference/source identity, a recorded review/correction without overwriting raw evidence, and a deliverable tied to the reviewed saved revision. Show reconnect behavior and explicitly test rejection of an unrelated user and viewer writes. Verify two-way presence/chat only through an authenticated project-scoped transport. Keep Desktop pairing and offline peer synchronization out of claims until separately proven.

Do not publish a collaboration claim or use source-only tests as multi-user browser proof. No architecture change is approved by this audit artifact alone.

Existing focused baseline: npx jest src/lib/realtime/__tests__/realtimeSync.test.ts --runInBand passed both tests. They prove local singleton document behavior only; they do not resolve the network or two-account gaps above.
