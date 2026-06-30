# Type Hygiene Migration Recipe (Phase 6)

**Goal:** Eliminate `any` types from the codebase. Currently ~1,987 `any`
occurrences across 380 files.

**Why:** `any` disables TypeScript's type checking — bugs that TS would catch
at compile time become runtime crashes. The OpenLayers `as any` pattern alone
(46 occurrences in `beacons/page.tsx`, 28 in `AnomalyHeatmap.tsx`) was hiding
real type errors that surfaced immediately when removed.

---

## The strategy: warn → fix → error

### Step 1: Turn on the rules as `warn` (DONE — see .eslintrc.json)

```json
"@typescript-eslint/no-explicit-any": "warn",
"@typescript-eslint/no-unsafe-assignment": "warn",
"@typescript-eslint/no-unsafe-member-access": "warn",
"@typescript-eslint/no-unsafe-call": "warn",
"@typescript-eslint/no-unsafe-argument": "warn",
"@typescript-eslint/no-unsafe-return": "warn",
```

`warn` doesn't break the build — it just surfaces the problem in the editor
and in `next lint` output. Existing violations don't block PRs.

### Step 2: Fix violations in waves (in progress)

Fix the worst-offender files first (highest `any` count). Use the audit:
```bash
python3 scripts/any_audit.py
```

### Step 3: Flip to `error` (future PR)

Once the count is low enough (target: <100 across the codebase), flip the
rules from `warn` to `error`. New PRs that add `any` without an
`eslint-disable` comment will be blocked.

```json
"@typescript-eslint/no-explicit-any": "error",
```

Escape hatch for genuinely-unknown cases:
```tsx
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = await riskyThirdPartyCall()
```

---

## Patterns to apply

### Pattern 1: Replace `as any` casts with proper types

The most common pattern in METARDU — dynamic imports with `as any` to bypass
missing types. But OpenLayers ships its own `.d.ts` files, so the casts are
unnecessary.

```tsx
// BEFORE — 14 `as any` casts, no type safety
const [MapMod, ViewMod, ...] = await Promise.all([
  import('ol/Map'), import('ol/View'), ...
])
const Map = (MapMod as any).default
const View = (ViewMod as any).default
const map = new Map({ ... })

// AFTER — typed imports, full type safety
import Map from 'ol/Map'
import View from 'ol/View'
import type { Map as MapType } from 'ol'

const mapInstance = useRef<MapType | null>(null)
const map = new Map({ ... })
```

**Same bundle size** — Next.js code-splits `ol` automatically. But now TS
catches API misuse.

### Pattern 2: Replace `useRef<any>(null)` with typed refs

```tsx
// BEFORE
const mapInstance = useRef<any>(null)

// AFTER
import type { Map as MapType } from 'ol'
const mapInstance = useRef<MapType | null>(null)
```

### Pattern 3: Type event handlers

```tsx
// BEFORE
const handleClick = (evt: any) => { ... }
map.on('click', handleClick)

// AFTER
const handleClick = (evt: { pixel: [number, number]; coordinate: [number, number] }) => { ... }
map.on('click', handleClick as (e: unknown) => void)
```

### Pattern 4: Type `forEachFeatureAtPixel` callbacks

```tsx
// BEFORE
const feature = map.forEachFeatureAtPixel(evt.pixel, (f: any) => f)

// AFTER
import Feature from 'ol/Feature'
const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f as Feature)
```

### Pattern 5: Cast `feature.get()` returns

OpenLayers' `Object.get()` returns `any`. Cast to the expected type:

```tsx
// BEFORE
popupRef.current.innerHTML = feature.get('popupText')

// AFTER
popupRef.current.innerHTML = feature.get('popupText') as string
```

### Pattern 6: Guard nullable returns

```tsx
// BEFORE — `extent` can be null, TS error hidden by `any`
map.getView().fit(extent, { ... })

// AFTER
const extent = vectorSource.getExtent()
if (extent && (extent[2] - extent[0] > 0 || extent[3] - extent[1] > 0)) {
  map.getView().fit(extent, { ... })
}
```

### Pattern 7: Re-assert non-null inside async closures

TypeScript can't track null checks across async boundaries:

```tsx
// BEFORE — `map` possibly null inside async closure
const map = mapInstance.current
if (!map) return
async function init() {
  map.setTarget(...)  // TS error: possibly null
}

// AFTER — re-assert inside the closure
async function init() {
  if (!map) return  // re-assert
  map.setTarget(...)
}
```

### Pattern 8: Replace `catch (err: any)` with `catch (err: unknown)`

```tsx
// BEFORE
} catch (err: any) {
  setError(err.message)
}

// AFTER
} catch (err: unknown) {
  setError(err instanceof Error ? err.message : String(err))
}
```

---

## Files fixed in Phase 6 Batch 1

| File | `any` before | `any` after | Notes |
|---|---|---|---|
| `src/components/fieldguard/AnomalyHeatmap.tsx` | 28 | 0 | OpenLayers dynamic imports → typed top-level imports |
| `src/app/beacons/page.tsx` | 46 | 0 | Same pattern; also fixed `catch (err: any)` → `unknown` |
| **Total** | **74** | **0** | **-74 `any` occurrences** |

## Next batches

Re-run `python3 scripts/any_audit.py` to find the next worst offenders. The
top remaining targets:

- `lib/api-client/client.ts` (58 `any`) — legacy Supabase proxy, marked `@deprecated`. Skip unless actively migrating.
- `lib/map/cadastralEditing.ts` (54 `any`) — OpenLayers pattern, same fix as above.
- `lib/db/queryBuilder.ts` (43 `any`) — Supabase-shaped query builder, `value: any` on every method. Needs a generic `<T>` type param.
- `app/fieldbook/page.tsx` (38 `any`) — likely a mix of patterns.
- `app/ai-plan-checker/page.tsx` (30 `any`)

Apply the same pattern: read the file, identify the `any` sources, apply the
appropriate fix from the patterns above, typecheck, commit.

---

## When NOT to remove `any`

- **Genuinely untyped third-party APIs** — if a library has no `.d.ts` files
  and no `@types/package` exists, `any` may be unavoidable. Add an
  `eslint-disable` comment with a reason.
- **Test fixtures** — `any` is sometimes OK in tests for brevity. Mark with
  `eslint-disable`.
- **`unknown` is usually better than `any`** — `unknown` forces you to
  type-narrow before using the value, while `any` lets you do anything.

---

## Verification after each batch

1. `npx tsc --noEmit` — clean typecheck (this catches real bugs that `any` was hiding)
2. `npx tsx src/lib/api/__tests__/client.selfcheck.ts` — 10/10 pass
3. `npx tsx scripts/cassini_golden_master.ts > /tmp/after.json && python3 scripts/golden_diff.py /tmp/golden_before.json /tmp/after.json` — byte-identical (defensive)
4. `python3 scripts/any_audit.py` — verify count went down
5. `git add -A && git commit && git push` — COMMIT AFTER EVERY BATCH
