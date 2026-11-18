# METARDU task board

Working task list. Evidence first: each item records what was measured before
changing anything, and what remains open.

## P1 — Page performance on /map (score 58 → target: fast on normal connections)

Status: diagnosed 2026-11-18. App-side is NOT the bottleneck; the fix is edge
caching + client connection quality. Items below are ordered by impact.

### Evidence (measured 2026-11-18)

| Measurement | Result | Meaning |
|---|---|---|
| `http://127.0.0.1:3000/map` TTFB (5 runs) | **8–10 ms** | The app renders the /map shell in ~10 ms. Server compute is not the problem. |
| `https://metardu.space/api/public/health` TTFB (3 runs) | 0.6–2.0 s | The Cloudflare edge → cloudflared tunnel → app round trip adds ~0.6–2 s per request on the current connection. |
| Browser timing breakdown (/map) | TLS 719 ms + other-before-request 665 ms + first-byte 1,196 ms | Matches the tunnel overhead plus a slow client connection (this machine measured 6.6 s TLS to google.com the previous day). |
| Static JS asset through Cloudflare | 1st fetch `cf-cache-status: MISS` → next fetches `HIT` (Age increments) | Edge caching of immutable `/_next/static/*` works. First visit per region still pulls through the tunnel. |
| HTML responses (`/login` sampled) | `Cache-Control: private, no-store`, `cf-cache-status: DYNAMIC` | No HTML is edge-cached — including public marketing pages. Middleware's per-request CSP nonce marks every response dynamic. |
| Query diagnostics | `slowQueries: []` | Database indexes are not the current bottleneck. Most "recommended" indexes already exist (verified in pg_indexes: projects, survey_points, field_photos, project_submissions). No index migration is justified by evidence. |
| Container memory | metardu-app 543 MiB / 2 GiB | Healthy headroom; not memory-thrashing. |
| `Uncaught TypeError: Cannot redefine property: ethereum` | Browser console | Caused by a crypto-wallet browser extension injecting `window.ethereum`, not by METARDU code. Re-test in an incognito profile with extensions off. |

### Actions

- [x] Verify app TTFB on localhost (done — 8–10 ms).
- [x] Verify static-asset edge caching (done — MISS → HIT).
- [x] Verify DB index recommendations against `pg_indexes` (done — no slow queries, indexes exist; no migration).
- [x] Rule out container memory pressure (done — 543 MiB / 2 GiB).
- [ ] **Owner, 2 minutes in the Cloudflare dashboard (Free plan supports this):** add a Cache Rule so public marketing HTML is served from the edge.
      Zone `metardu.space` → Caching → Cache Rules → Create rule:
      - Rule name: `public-marketing-html-edge-cache`
      - When: Hostname equals `metardu.space` AND URI Path in
        `{"/", "/login", "/register", "/demo", "/pricing"}` OR URI Path starts with `/docs/`
        AND Cookie `next-auth.session-token` does not exist
      - Then: Eligible for cache, Edge TTL → Ignore cache-control and use this TTL → 1 day,
        Browser TTL → 5 minutes.
      - Signed-in surveyors (session cookie present) bypass the rule, so
        personalised pages are never cached.
- [ ] **Owner, 1 minute:** Cloudflare dashboard → Speed → Optimization → enable **Early Hints**.
      The HTML already contains `preload` links for the JS entry chunks; Early Hints
      pushes them before the HTML arrives and directly improves FCP/LCP.
- [ ] Re-run the browser performance sample after the two dashboard changes and
      record before/after FCP/LCP here.
- [ ] Optional app-side (only if numbers still miss budget): split the OpenLayers
      map client chunk further and preload the route chunk for `/map` from the
      dashboard.

### Honest expectation

100/100 is not a reachable target for a GIS SPA on the current connection:
TLS 719 ms and the tunnel round trip are charged to the score before the app
answers (the app itself answers in 10 ms). After the two dashboard changes,
repeat visits should see edge-served HTML + JS and a materially higher score;
first-visit-per-region and the connection quality set the floor.

## P2 — NTRIP correction provenance per point (in flight)

- [ ] Correction-session store (caster, mountpoint, last RTCM age) readable at capture.
- [ ] Capture writes parseable correction tokens with the point.
- [ ] Fix verdict downgrades RTK Fixed when corrections are absent or stale.

## P3 — Client delivery action

- [ ] Send the client-ready package link by email/WhatsApp from the Deliver
      stage (package route already returns a 7-day signed URL).
