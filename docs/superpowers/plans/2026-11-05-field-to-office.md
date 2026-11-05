# Field-to-office collaboration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execute inline in the existing checkout; do not delegate or create a worktree.

**Goal:** Deliver the approved authenticated field/office review workflow, plus separately verified Desktop account recognition.

**Architecture:** PostgreSQL remains authoritative for saved observations, review and deliverable revision identity. Short-lived authenticated rooms carry validated presence/chat/change notifications. Desktop obtains real account identity through external-browser authorization and a main-process-only boundary.

**Tech Stack:** Existing Next.js/TypeScript, PostgreSQL/RLS, Zod, WebSocket collaboration service, Electron sandboxed preload/main, Jest/Vitest.

**Spec:** docs/superpowers/specs/2026-11-05-field-to-office-design.md

## Global constraints

- No production customer observation, drawing, membership or billing change is part of the demo.
- No extra application container, worktree, builder or blanket cleanup.
- Unknown roles and unassigned legacy projects fail closed.
- Keep credentials and any session secrets in the main process, not renderer/localStorage.
- Existing registered files retain their bytes and recovery behavior.
- Preserve offline local computation; no offline lease, seat count, sync or signed entitlement is invented.

### Task 1: Shared room contract and access policy

Files: create src/lib/realtime/collaborationProtocol.ts and its __tests__/collaborationProtocol.test.ts; create projectRoomAccess.ts and projectRoomAccess.test.ts; create roomTicket.ts and roomTicket.test.ts. Modify ticket/route.ts and collaborationServer.ts only after these shared boundaries pass.

Interfaces: RoomRole = owner | super_admin | org_admin | project_manager | surveyor | viewer. roomPermissions(role: unknown) returns {canChat:boolean,canNotifyChange:boolean,canShareCursor:boolean} or null. clientRoomMessageSchema and serverRoomMessageSchema are discriminated Zod unions; no survey geometry mutation command is valid. resolveProjectRoomAccess(userId:string,projectId:string) returns the recognized role or null after existing ownership/read/RBAC checks.

- [ ] Write negative contract/access tests first, including unknown role, viewer writes, invalid coordinates, oversized payload, wrong project, unassigned legacy parent and unrelated user.

```ts
expect(roomPermissions('viewer')).toEqual({canChat:false,canNotifyChange:false,canShareCursor:false})
expect(roomPermissions('made-up-admin')).toBeNull()
expect(clientRoomMessageSchema.safeParse({type:'feature_edit',feature:{id:'p'}}).success).toBe(false)
```

- [ ] Run npx jest src/lib/realtime/__tests__/collaborationProtocol.test.ts src/lib/realtime/__tests__/projectRoomAccess.test.ts --runInBand and retain the initial failure.
- [ ] Implement the shared schemas and access policy, then bind authenticated tickets to role/project/expiry. Preserve current ownership and legacy-containment checks.
- [ ] Run those tests plus existing auth/rbac/ownership suites and TypeScript checks. Commit only owned files after review.

### Task 2: Authenticated server/client lifecycle

Files: collaborationServer.ts, new authenticatedRoomClient.ts plus its tests, useCollaboration.ts, ProjectWorkspaceClient.tsx, CollaborationPanel.tsx.

Interfaces: createAuthenticatedRoomClient({projectId,onReady,onPresence,onChat,onRecordsChanged,onDisconnected}) returns {connect():Promise<void>,sendChat(message:string):boolean,notifyRecordsChanged():boolean,disconnect():void}. Every callback receives schema-validated server data. The hook accepts onChat and onRecordsChanged in its input and reports Connected only after ready acknowledgement.

- [ ] Write lifecycle tests with fake sockets/timers: delayed open, server-ready binding mismatch, reconnect obtains a new ticket, old socket events ignored, project/account changes clear state, heartbeat/expiry cleanup and unavailable endpoint stays disconnected.

```ts
client.disconnect()
socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(oldRoomMessage)}))
expect(onChat).not.toHaveBeenCalled()
```

- [ ] Implement one authenticated JSON protocol end-to-end; remove this workspace's reliance on the optional unauthenticated mesh. Keep saved coordinates outside messages. Server-generated sender IDs/timestamps replace client claims.
- [ ] Verify a secure production path without changing DNS or restarting services during source tests. Expose clear unavailable/reconnect UI instead of a simulated connection.
- [ ] Test two loopback test clients against the service implementation, then source browser clients. No production chat/demo messages or new memberships.
- [ ] Run focused tests/types/lint, inspect cleanup/security, and make a scoped commit.

### Task 3: Field/office permissions and durable review

Files: existing auth/ownership and RBAC helpers, project workspace access, field-observation endpoints, topo surface read/review endpoints, deliverable register read paths; add a forward review-record migration and review service/tests if no existing immutable review record can express the required binding.

Interfaces: submitSourceReview({projectId,sourceRevisionId,expectedSourceHash,requestId,outcome,note},actorId) atomically returns {reviewId,sourceRevisionId,sourceHash,outcome}; repeated identical requests return the original result, changed reuse conflicts. outcome is changes_requested or reviewed_for_draft, never professional approval. Read paths use recognized project roles; generation retains explicit entitlement and generation permissions.

- [ ] Test reviewer access, denied viewer writes, unrelated reads, stale hash 409, replay identity, retained raw observation immutability and changed-source review invalidation before implementation.

```ts
await expect(submitSourceReview(staleReview,reviewerId)).rejects.toMatchObject({statusCode:409})
expect((await db.query('SELECT * FROM survey_observations WHERE id=$1',[observationId])).rows[0]).toEqual(originalRawObservation)
```

- [ ] Implement transaction-bound review/correction lineage and actor/time audit; do not overwrite raw data or broaden generic table write access.
- [ ] Connect crew-save notifications and office authoritative refetch; show version/status, refresh and conflict resolution on phone/desktop.
- [ ] Add review source/hash linkage to draft deliverable manifest without changing historical files. Test exact old-request recovery and stale review refusal.
- [ ] Rehearse forward SQL/RLS/runtime/rollback against isolated synthetic data; preserve all 129 applied hashes. Commit a coherent tested slice.

### Task 4: Desktop account identity and project access

Files: add a Web desktop-authorization module/routes and approval page; add Desktop ADR and scoped brief, main/account.ts plus account tests, account IPC schema, preload allowlist, license-service and LicensingView. Preserve existing sync queue and unrelated dirty hunks.

Interfaces: account.start() returns {verificationUri,userCode,expiresAt}; account.check() returns Pending | VerifiedAccount | Denied | Expired; VerifiedAccount contains server user ID/name/email, server subscription status/plan, verifiedAt/expiresAt and authorized project summaries. Secrets never appear in these renderer interfaces. account.signOut() clears the main-process session.

- [ ] Audit the incompatible existing callback login and write an ADR covering scoped external-browser authorization, exact origin policy, proof binding, expiry, token ownership and IPC caller validation.
- [ ] Test mismatched proof/code, denial, expiry, polling backoff, replay, offline server, unexpected redirect/origin, account switch and forged persisted renderer license data. Do not start with real credentials.

```ts
expect(await account.check()).toMatchObject({status:'EXPIRED'})
expect(rendererResult).not.toHaveProperty('accessToken')
expect(await account.check()).not.toMatchObject({isAuthenticated:true,tier:'enterprise'}) // no issuer response
```

- [ ] Implement server-authorized identity/project reads and main-process verification. Do not invent offline lease, signed token hash or seats, and do not connect the generic destructive sync queue through the identity flow.
- [ ] Run native unit suites, main/preload/renderer types and build; preserve required missing smoke/GDAL/packaging gates explicitly. Verify the real account through the concrete browser approval screen only after source checks.
- [ ] Verify that Desktop displays the actual Enterprise identity/plan and authorized projects, then sign-out/expiry behavior. Account recognition is distinct from geometry pairing.

### Task 5: Two-user demonstration and one release

Files: owned QA fixture/helper and evidence docs; existing release verifier artifacts.

- [ ] Exercise separate synthetic crew/reviewer sessions plus viewer/unrelated negative controls. Capture save, office receipt, review/correction, reconnect, stale conflict, draft export and byte-identical recovery. Retain each authoritative record ID/hash and screenshots.
- [ ] Inspect all rendered artifacts for clipping/overlap, references, draft wording and readable phone controls. Do not infer field accuracy from contour interval.
- [ ] Complete exact source/CI/security/release/recovery gates, then one reusable candidate build and one planned promotion with protected rollback and fresh verified checkpoint.
- [ ] Verify exact live image/release ID, retained originals/supports/uploads/migration hashes, real authenticated browser flows, and current Desktop account separately.
- [ ] Prepare the collaboration promotion from actual accepted UI footage, with accurate scope labels; obtain approval for that new post/media before publishing it. Keep physical/professional/provider/offsite/security gates explicit.
