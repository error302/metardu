# Cloudflare cache and compression policy

METARDU is served through Cloudflare in front of the application origin. Keep
Cloudflare's cache scoped to content that is public and immutable. Do not add a
site-wide “Cache Everything” rule: project pages, reports, generated files, and
API responses can contain account data.

## Origin behavior

- `/_next/static/*` contains content-hashed build assets and returns
  `Cache-Control: public, max-age=31536000, immutable` from Next.js and Caddy.
  Nginx already emits the same policy for this path.
- `/api/*` and authenticated workspace paths return `Cache-Control: private,
  no-store`. This includes project/map/field workspaces and report APIs.
- `/sw.js` remains `no-store` so a new service worker can be discovered after a
  release.
- Next.js compression is enabled. Caddy negotiates gzip/zstd at the origin;
  Nginx has gzip enabled. Streaming server-sent-event routes keep their
  route-specific `no-transform` directive to avoid intermediary buffering;
  do not add it to ordinary page, API, or file responses.

## Cloudflare Cache Rules

In the `metardu.space` zone, verify the DNS record is proxied, then keep these
rules after any broader cache rule so the final matching rule is authoritative:

1. **Bypass application traffic**

   Expression:

   ```text
   not starts_with(http.request.uri.path, "/_next/static/")
   ```

   Set **Cache eligibility** to **Bypass cache**. This keeps every page, API,
   project/report response, and generated download out of Cloudflare's cache,
   including newly added routes. The origin also sends `private, no-store` for
   APIs and authenticated pages; retain both safeguards.

2. **Cache versioned Next.js assets**

   Expression:

   ```text
   starts_with(http.request.uri.path, "/_next/static/")
   ```

   Set **Cache eligibility** to **Eligible for cache** and leave Edge TTL and
   Browser TTL governed by the origin headers. Place this rule after the
   bypass rule. Do not apply it to `/_next/data/`, HTML, service workers, or API
   paths.

## Map tiles

The app currently requests OpenStreetMap and Esri tiles directly from their
providers. Those requests do not pass through the `metardu.space` Cloudflare
zone, so a METARDU Cache Rule cannot cache them at Cloudflare. Let the browser
honor each provider's tile cache headers; do not force a longer service-worker
TTL. OpenStreetMap requires clients to honor its HTTP caching headers (or keep
tiles for at least seven days only when the cache cannot read them) and forbids
bulk prefetch/offline use.

Do not proxy OpenStreetMap tiles through METARDU or Cloudflare as a shortcut:
the OSM Foundation discourages caching proxies, requires cache-policy and
request-identity compliance, and prohibits bulk/offline tile downloads from
its public tile service. A first-party edge-cached tile endpoint should only be
added after METARDU has a provider or dataset license that permits proxying and
caching. The offline tile downloader therefore accepts licensed or self-hosted
XYZ endpoints and rejects the public OSM tile host and the Esri World Imagery
endpoint, whose service metadata does not permit tile export. Uploaded MBTiles
remain owner-scoped and must stay `private, no-store`.

## Verification after publishing the origin

- Request a built `/_next/static/...js` URL twice and confirm the second
  Cloudflare response is a cache hit (`CF-Cache-Status: HIT`) and has the
  immutable Cache-Control header.
- Request an authenticated project/report API while signed in and confirm
  `Cache-Control: private, no-store` and that Cloudflare does not report a hit.
- Check a representative JS/CSS response with `Accept-Encoding: br`; confirm
  `Content-Encoding` is present. Compare transferred bytes from a production
  response, not the uncompressed build size.

Cloudflare Cache Rules are zone settings and cannot be deployed by this source
tree alone. Use the Cloudflare dashboard or its API/Terraform once the zone
credentials and current rules are available; do not replace existing zone
rules wholesale.

References: [Cloudflare Cache-Control behavior](https://developers.cloudflare.com/cache/concepts/cache-control/),
[Cloudflare Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/),
[Cloudflare compression](https://developers.cloudflare.com/speed/optimization/content/compression/),
[OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
