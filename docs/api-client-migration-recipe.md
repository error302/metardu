# API Client Migration Recipe

**Goal:** Replace ~217 inline `fetch()` calls with the typed `api()` / `apiGet()` /
`apiPost()` / `apiPatch()` / `apiDelete()` helpers from `src/lib/api/client.ts`.

**Why:** one error path, one place to add retry/cache/telemetry, response
schema validation, typed return values, deduplication of concurrent requests.

**Ponytail rule:** if a migration doesn't shrink the file or remove a bug,
leave it alone. YAGNI applies to refactors too.

---

## The four patterns you'll see

### Pattern 1 — GET with JSON envelope (most common)

```tsx
// BEFORE (5 lines, no error handling, no validation, no types)
const res = await fetch(`/api/scheme/team?project_id=${projectId}`)
const data = await res.json()
if (data.data) {
  setOwner(data.data.owner)
  setTeam(data.data.team)
}

// AFTER (3 lines, validated, typed, with cache control)
const result = await apiGet(
  `/api/scheme/team?project_id=${projectId}`,
  teamResponseSchema,
  { ttlMs: 0 },
)
setOwner(result.data.owner)
setTeam(result.data.team)
```

### Pattern 2 — POST with JSON body

```tsx
// BEFORE
const res = await fetch('/api/scheme/assign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ project_id, block_id, assigned_to }),
})
if (res.ok) { ... }

// AFTER (apiPost handles JSON.stringify + Content-Type automatically)
await apiPost(
  '/api/scheme/assign',
  z.object({ ok: z.boolean().optional() }).passthrough(),
  { project_id, block_id, assigned_to },
)
```

### Pattern 3 — DELETE

```tsx
// BEFORE
const res = await fetch(`/api/scheme/assign?block_id=${blockId}`, { method: 'DELETE' })
if (res.ok) { ... }

// AFTER
await apiDelete(`/api/scheme/assign?block_id=${blockId}`)
```

### Pattern 4 — Error handling (the real win)

```tsx
// BEFORE — silent swallow, no UX feedback
try {
  const res = await fetch(...)
  const data = await res.json()
  if (data.data) { ... }
} catch {}  // 🤫

// AFTER — typed errors, user-facing feedback, contract drift detection
try {
  const result = await apiGet('/api/x', schema)
  setData(result)
} catch (err) {
  if (err instanceof ApiError) {
    if (err.isUnauthorized) router.push('/login')
    else if (err.isValidation) setFormErrors(err.issues)
    else if (err.isNotFound) setShowEmptyState(true)
    else setError(err.message)
  }
}
```

---

## Step-by-step per file

1. **Identify the response shape.** Open the API route file and look at what
   `NextResponse.json()` returns. Most routes wrap their payload in `{ data: ... }`.
2. **Write the Zod schema.** Define it at the top of the consumer file (until
   Phase 4 wave 2 moves schemas into `src/lib/api/schemas/`). Use `.passthrough()`
   on objects that have fields you don't display.
3. **Replace each `fetch()` call** with the appropriate helper:
   - GET → `apiGet()` (with cache) or `api()` (no cache)
   - POST → `apiPost()`
   - PATCH → `apiPatch()`
   - PUT → `apiPut()`
   - DELETE → `apiDelete()`
4. **Add error handling.** At minimum: catch `ApiError`, surface `err.message`
   to the user. Handle `err.isUnauthorized` by redirecting to `/login`.
5. **Typecheck:** `npx tsc --noEmit`.
6. **Run the page in the browser.** Verify: data loads, mutations work, errors show up.
7. **Commit.** One file per commit: `refactor(api-client): migrate <file>`

---

## Cache invalidation rules of thumb

| TTL | Use case |
|---|---|
| `0` (no cache) | Data that mutates frequently: team assignments, activity logs, traverse computations |
| `30_000` (30s, default) | Lists that change occasionally: projects, blocks, parcels |
| `300_000` (5min) | Reference data: survey standards, beacon types |
| `3600_000` (1hr) | Static-ish data: Kenya topo sheet metadata |

After any mutation, call `apiInvalidate(path)` for the GET endpoints that return
the mutated resource. `apiInvalidateAll()` on logout.

---

## When NOT to migrate

- **File upload routes** (`FormData` body): client supports FormData (skips JSON.stringify) but you lose Zod body validation.
- **Server-side fetch** in `route.ts` handlers: use `db.query()` directly.
- **Streaming endpoints** (SSE, WebSocket): client doesn't stream.
- **Routes that return non-JSON** (PDF, DXF, image downloads): use `fetch()` directly.
- **The deprecated `src/lib/api-client/client.ts`** (Supabase DB proxy): leave alone.

---

## Migration waves

### Wave 1 — Highest-impact pages (DONE — see git log)
- `src/app/project/[id]/scheme/team/page.tsx` (5 fetches)
- `src/app/project/[id]/scheme/page.tsx` (5 fetches)
- `src/app/project/[id]/scheme/blocks/[blockId]/page.tsx` (5 fetches)
- `src/app/admin/page.tsx` (4 fetches)
- `src/app/rim/page.tsx` (14 fetches — 1 kept as binary PDF download)
- `src/app/project/[id]/engineering/page.tsx` (5 fetches)

### Wave 2 — Mid-impact (do second)
- `src/components/workspace/ExportToolbar.tsx` (4 fetches)
- `src/app/project/[id]/submission/SubmissionClient.tsx` (4 fetches)
- `src/app/project/[id]/scheme/blocks/page.tsx` (4 fetches)
- `src/components/workspace/WorkflowStepPanel.tsx` (3 fetches)

### Wave 3 — Server-side libs (SKIP)
- `src/lib/payments/*.ts` — external payment provider calls, not METARDU's API
- `src/lib/compute/pythonService.ts` — Python sidecar, different contract
- `src/lib/api-client/client.ts` — legacy Supabase DB proxy

### Wave 4 — Small components (~150 files, 1–2 fetches each)
Batch in groups of 10–20 per PR.

---

## Total expected payoff

- ~217 inline fetches → 1 typed client + ~50 Zod schemas
- ~600 LOC of duplicated boilerplate removed
- 1 error path (ApiError with code/status/issues)
- Response contract drift caught at runtime in dev
- In-memory cache eliminates duplicate concurrent GETs

---

## Verifying after each migration

1. `npx tsc --noEmit` — clean typecheck
2. `npx tsx src/lib/api/__tests__/client.selfcheck.ts` — 10/10 pass
3. `npx tsx scripts/cassini_golden_master.ts > /tmp/after.json && python3 scripts/golden_diff.py <baseline> /tmp/after.json` — cassini still byte-identical (defensive)
4. Manual: load the migrated page, perform one GET + one mutation
