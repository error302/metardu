# Field-to-office implementation progress - 5 November 2026

The user approved the field-to-office design and requested actual Desktop account recognition. The approved spec and inline execution plan are docs/superpowers/specs/2026-11-05-field-to-office-design.md and docs/superpowers/plans/2026-11-05-field-to-office.md. The source parent at implementation start is documentation-only 3bc32fae; deployed application remains 7290f5c4. No candidate build or promotion is part of this checkpoint.

Initial implemented boundaries:

- collaborationProtocol.ts: recognized project roles, explicit viewer restrictions, bounded strict chat/cursor/change-notification schemas, validated server identity/room/protocol acknowledgement, no survey geometry replacement command.
- projectRoomAccess.ts: existing authoritative read access and canonical RBAC, fail-closed unknown roles and unassigned legacy parents; owner authority comes only from the parent project record.
- roomTicket.ts: constant-time HMAC verification, exact project/identity/role/protocol binding, bounded input, five-minute maximum expiry and denial at the expiry boundary; missing explicit role defaults to viewer.

At the initial foundation checkpoint these modules were not wired into the client/server path. The subsequent source increment below wires that path; the old production service remains unchanged. Neither checkpoint proves a connected Desktop account, durable field-to-office review or live browser acceptance.

Regression-first receipts:

~~~text
collaborationProtocol.test.ts initial: Cannot find module '../collaborationProtocol'.
After implementation: Tests: 20 passed, 20 total.
projectRoomAccess.test.ts initial: Cannot find module '../projectRoomAccess'.
After implementation with protocol/ownership/RBAC: 4 suites passed; 62 tests passed.
roomTicket.test.ts initial: Cannot find module '../roomTicket'.
After implementation with protocol/access: 3 suites passed; 43 tests passed.
~~~

The node-environment ticket suite emitted Node's ExperimentalWarning for unavailable localStorage from the test environment; no runtime browser-storage workaround was added. The first combined final verification command was not executed because automatic approval review disconnected; the type/lint retry is recorded separately. Do not treat that infrastructure failure as an application failure or as a passed command.

Desktop audit: license-service.ts intentionally returns UNCONFIGURED; signInWithWebAccount throws because no verification service is connected. The older SyncClient expects a token from /api/auth/callback, which does not implement the current Web authentication contract. No real password, browser cookie or Web session was extracted, accepted or fabricated. Follow the spec's external-browser/main-process authorization boundary and ADR requirement when implementing the requested account recognition. Preserve unrelated Desktop dirty work and staged frontend deletion.

## Authenticated transport and workspace source increment - 6 November 2026

The HTTP issuer now resolves canonical project roles and signs versioned, five-minute room grants. Its browser response includes only the expected account/project/role/protocol/expiry metadata and has Cache-Control no-store. Unknown roles, inaccessible projects and missing authentication configuration fail closed. The issuer no longer imports the WebSocket server into the Next.js route.

The room server and browser client now use the same strict JSON protocol. Grants travel in the WebSocket protocol header rather than the URL. The server validates the trusted browser origin, stamps sender/message identity and time, enforces viewer restrictions, refuses survey geometry mutation messages, bounds payloads/rates/slow clients, expires connected grants and cleans up rooms, listeners and timers. Reconnect obtains a fresh HTTP grant. Only a matching ready acknowledgement enables Connected; mixed-content or different-origin production endpoints are refused. A ten-second grant/handshake timeout and heartbeat loss clear ready state.

The workspace uses this channel rather than the optional local Yjs/WebRTC path for presence/chat. Server-acknowledged messages are deduplicated and bounded; a project/account change clears prior chat and suppresses late callbacks. Reconnect and saved-record notices refresh authoritative workflow reads. The panel exposes read-only/unavailable states, retains text on a failed send, uses 44px input/send controls and labels transient chat separately from retained review decisions.

Standalone service packaging now includes the shared protocol/ticket modules and the existing pinned Zod version. The exact standalone TypeScript compiler invocation passed and its compiled module started on a temporary loopback port, returned protocolVersion 1, and stopped cleanly. No Docker image build, new application container or production service replacement occurred.

Verification: 76 focused collaboration tests passed in nine suites. A broader run including current ownership/RBAC, unassigned-record containment, registered export contracts and monitoring regressions passed 173 tests in 17 suites. All three TypeScript projects passed after correcting the browser adapter/test identity types. Focused collaboration lint passed with zero warnings/errors; the final message-deduplication edit is included in the broader test run and the final focused hook/test lint receipt. No implementation edits occurred after the passing app/test/tool type checks except this typed Set-based deduplication and comment/whitespace changes; exact-source checks remain a release gate. Initial missing-client, incompatible old-server/issuer, jsdom scrollIntoView and strict typing failures were retained as observed failures, not attributed to deployed production. The scroll shim is test-only and restores its prior descriptor.

## Remaining gates before collaboration release

- The production collaboration service still runs its old image and protocol. An application promotion alone must not be reported as updating that support. Plan a coordinated compatible service/app promotion and verified rollback after complete source acceptance.
- docker-compose currently supplies neither a trusted origin to the service nor a demonstrated public same-origin WSS route; its default client URL points to localhost. Configure and prove the owned secure route as part of the reviewed release. Do not alter DNS/tunnels or restart supports to make a source test pass.
- Durable source-hash review/correction records, crew-save notifications, canonical workspace/data membership reads and explicit generation roles remain incomplete. A transient records_changed message is an invalidation hint, not proof that any survey row was saved or reviewed.
- Actual separate crew/reviewer browser sessions, viewer/unrelated negative controls, retained original bytes/request replay, mobile rendered acceptance and real Desktop identity remain open. No marketing claim of completed collaboration, automatic pairing or professional acceptance is supported yet.
