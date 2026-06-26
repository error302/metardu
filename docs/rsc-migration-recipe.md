# RSC Migration Recipe (Phase 5)

**Goal:** Convert `'use client'` pages to React Server Components where it
shrinks the bundle without changing behavior.

**Ponytail rule:** don't convert a page unless the migration removes code.
If RSC doesn't shrink the file or remove a client-only import, leave it alone.

---

## The easy win: thin-wrapper pages

Most tool pages in METARDU are thin wrappers:

```tsx
// BEFORE — 'use client' for no reason
'use client';
import PageHeader from '@/components/shared/PageHeader'
import SomeCalculator from '@/components/SomeCalculator'

export default function SomePage() {
  return (
    <div>
      <PageHeader title="..." />
      <SomeCalculator />
    </div>
  )
}
```

The page itself has NO hooks, NO state, NO event handlers. The interactivity
lives in the child (`<SomeCalculator />`), which has its own `'use client'`.

**Fix:** just delete the `'use client'` line. The page becomes a server
component that renders a client component. Zero behavior change, smaller
bundle (the page module no longer ships to the browser).

```tsx
// AFTER — server component
import PageHeader from '@/components/shared/PageHeader'
import SomeCalculator from '@/components/SomeCalculator'

export default function SomePage() {
  return (
    <div>
      <PageHeader title="..." />
      <SomeCalculator />
    </div>
  )
}
```

### How to find candidates

```bash
python3 scripts/find_easy_rsc_wins.py
```

Outputs all `'use client'` pages that have:
- No `useState`, `useEffect`, `useCallback`, `useRef`, `useMemo`, `useContext`, etc.
- No `onClick`, `onChange`, `onSubmit`, etc. event handlers
- No `window`, `document`, `localStorage`, `sessionStorage`, `navigator` access

### When NOT to convert (even if the audit says it's a candidate)

- **Page uses `<motion.div>` or other framer-motion JSX directly** — `motion`
  is a client-only API. Either extract the motion usages to a child client
  component (adds code — ponytail says skip), or leave the page as client.
- **Page uses `useRouter`, `usePathname`, `useSearchParams`** — these are
  client hooks. Leave as client.
- **Page passes non-serializable props to children** (functions, class
  instances, etc.) — server components can only pass serializable props.

---

## The harder win: extracting interactivity

For pages that mix read-only rendering with a small interactive bit:

```tsx
// BEFORE — entire page is client because of one button
'use client';
import { useState } from 'react'

export default function Page() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <h1>Static Title</h1>
      <p>Static content...</p>
      <button onClick={() => setOpen(!open)}>Toggle</button>
      {open && <div>Interactive content</div>}
    </div>
  )
}
```

Extract the interactive bit to a client child:

```tsx
// AFTER — page is server, interactivity in child
// page.tsx (SERVER component — no 'use client')
import TogglePanel from './TogglePanel'

export default function Page() {
  return (
    <div>
      <h1>Static Title</h1>
      <p>Static content...</p>
      <TogglePanel />
    </div>
  )
}

// TogglePanel.tsx (CLIENT component)
'use client';
import { useState } from 'react'

export default function TogglePanel() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(!open)}>Toggle</button>
      {open && <div>Interactive content</div>}
    </>
  )
}
```

**Ponytail check:** this only makes sense if the static part is substantial
(more LOC than the interactive part). If the page is 90% interactive, leave
it as one client component.

---

## The data-fetching win (biggest payoff, hardest to do)

For pages that fetch data via `useEffect + fetch`:

```tsx
// BEFORE — client component fetches data after hydration
'use client';
import { useEffect, useState } from 'react'

export default function Page() {
  const [data, setData] = useState(null)
  useEffect(() => {
    fetch('/api/x').then(r => r.json()).then(setData)
  }, [])
  if (!data) return <Loading />
  return <Display data={data} />
}
```

Convert to server component that fetches directly:

```tsx
// AFTER — server component fetches at request time
import { db } from '@/lib/db'
import Display from './Display'
import Loading from './Loading'

export default async function Page() {
  const { rows } = await db.query('SELECT * FROM x')
  if (rows.length === 0) return <Loading />
  return <Display data={rows} />
}
```

**Benefits:**
- No client-side fetch roundtrip (data is in the initial HTML)
- No loading flash (server waits for data before sending HTML)
- Smaller bundle (no fetch boilerplate shipped to browser)

**Caveats:**
- The page must be `async` (server components can be async)
- Any interactive child must be extracted as a client component
- `db.query()` sets RLS context automatically if `setCurrentUserId()` was
  called by the API handler — but in a server component, there's no API
  handler. You'll need to get the session via `getServerSession(authOptions)`
  and call `setCurrentUserId()` manually before querying.

**Pattern:**
```tsx
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db, setCurrentUserId } from '@/lib/db'

export default async function Page() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return <LoginRequired />
  setCurrentUserId(String(session.user.id))

  const { rows } = await db.query('SELECT * FROM projects WHERE user_id = $1', [session.user.id])
  return <ProjectList projects={rows} />
}
```

---

## Migration batches

### Batch 1 (DONE — see git log)
8 thin-wrapper pages converted by removing `'use client'`:
- `app/tools/setting-out/page.tsx`
- `app/tools/cogo/page.tsx`
- `app/map/page.tsx`
- `app/enterprise/page.tsx`
- `app/tools/cross-sections/page.tsx`
- `app/tools/beacon-reference/page.tsx`
- `app/tools/us-survey-reference/page.tsx`
- `app/tools/survey-regulations/page.tsx`

### Batch 2 (next — extract interactivity)
Pages with a small interactive bit mixed into mostly-static content:
- `app/page.tsx` (805 LOC landing page — uses `<motion.div>` directly, needs extraction)
- Other pages identified by re-running the audit with `--maybe` flag

### Batch 3 (biggest payoff — data-fetching conversion)
Pages that fetch via `useEffect + fetch`:
- `app/projects/page.tsx` (project list)
- `app/admin/page.tsx` (admin dashboard)
- `app/audit-logs/page.tsx`
- `app/notifications/page.tsx`
- `app/schedule/page.tsx`

These are the highest-traffic read-only pages. Converting them to RSC +
`db.query()` eliminates the client-side fetch roundtrip.

### Batch 4 (long tail)
~50 more read-only pages with similar patterns.

---

## Verification after each batch

1. `npx tsc --noEmit` — clean typecheck
2. `npx tsx src/lib/api/__tests__/client.selfcheck.ts` — 10/10 pass
3. `npx tsx scripts/cassini_golden_master.ts > /tmp/after.json && python3 scripts/golden_diff.py /tmp/golden_before.json /tmp/after.json` — byte-identical (defensive)
4. Manual: load each converted page, verify it renders correctly
5. `git add -A && git commit && git push` — COMMIT AFTER EVERY BATCH
