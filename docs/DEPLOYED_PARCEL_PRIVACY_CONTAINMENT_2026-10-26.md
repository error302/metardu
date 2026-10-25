# Deployed parcel privacy: observed exposure and active containment

## Current evidence

On 26 October Africa/Nairobi, read-only inspection of the existing `metardu-app`
container `dd4e758409e4d443c1d9f4e0470ca48131b4b90cdd0cdd5efec7093d887ddc8a`
found the legacy public handler in image
`sha256:06103336484035d2aad7d3a1d45cf9bb37b8a814507b190108f5ae1586a9d0b0`.
Its compiled route SHA-256 is
`fcbb6bb90b0907a71aab564b99d078ba4f6f7175f937dc666735b47e7edcdc97`.
The route and referenced chunks contain the old client/professional/monument
fallbacks and lack the new capability reader.

An anonymous request with only the reserved nil UUID reaches the old handler
both through loopback and through `https://metardu.space`, including its
`/api/v1/public/parcel/` alias. The public responses return the legacy
`Survey parcel record not found` message, HTTP 404, no parcel payload,
`CF-Cache-Status: DYNAMIC` and no challenge marker. The public health endpoint
returns healthy/200. These probes do not request a real customer identifier or
retrieve a customer record. Actual customer access/exfiltration was not tested
or established.

The source repair in `d915a544` is therefore **not the deployed protection**.
Runtime health and no-store response headers do not fix anonymous disclosure.
The compiled/loopback receipt is
`.cache/parcel-draft-sharing/deployed-public-audit.json` (21:54:29 UTC,
25 October). The first public-edge observation was at 21:57:36 UTC. The public
edge receipt was refreshed after containment; it now records the protected state.

## Applied temporary Cloudflare rule

Rule name: `METARDU temporary private-parcel guard`

Action: **Block**, not Managed Challenge. Place it before any custom Skip rule
that could bypass this guard. Review existing rules before editing them.

Expression:

```text
(http.host in {"metardu.space" "www.metardu.space"})
and starts_with(lower(url_decode(http.request.uri.path, "r")), "/api/")
and (lower(url_decode(http.request.uri.path, "r")) contains "/public/parcel")
```

The decoded API-path match covers the observed canonical/versioned lookup and
encoded variants. It does not match `/api/public/health`, authentication,
workspace pages or ordinary project APIs. It intentionally closes this legacy
public lookup family while the reviewed release remains gated. Cloudflare's
[function reference](https://developers.cloudflare.com/ruleset-engine/rules-language/functions/)
documents recursive URL decoding; [URL normalization](https://developers.cloudflare.com/rules/normalization/)
explains why encoded paths must be considered. Do not change global URL rewrite
or cache policies as part of this rule.

Before applying: retain the original zone ruleset/version, inspect Skip rules
and other tunnel public hostnames, and identify the exact new rule ID. No other
rule should be removed/reordered except as required to make this guard effective.

After applying, independently verify canonical, versioned and encoded nil-ID
paths are blocked without a challenge while public health, landing/login and an
existing authorized workspace still work. Retain rule/version and request-ray
evidence. Re-test that no alternative public hostname/ingress bypasses it.
A denied probe alone is not proof of the intended rule configuration.

The application origin is bound only to `127.0.0.1:3000`. No active local Caddy /
Nginx listener was found on 80/443/2019/8080/8081. A Cloudflared Windows service
and a separate token-bearing Cloudflared process are running, with different
parents; their ingress/replica relationship is not assumed. No zone-management connector
or API credential was found in the configured environment/source dotenv names.
Tunnel transport credentials must not be treated as zone-rule authority.

**Applied and verified:** after the owner authorized Cloudflare sign-in, the
existing signed-in dashboard was used to deploy this exact rule on 26 October
Africa/Nairobi (25 October, approximately 22:10 UTC). Cloudflare validated the
expression before deployment. The persisted editor and rule inventory show:

- Zone: `metardu.space`, ID `c66b1fa464f1fa870e72d71ea9020a1c`.
- Rule ID: `0865888cf7b3440cb255daf61fb3a045`.
- Action **Block**, status **Active**, execution order **First**.
- Before: zero custom rules. After: this one custom rule. No existing custom
  Skip rules were present. The existing `Leaked credential check` rate-limit
  rule, ID `3ac2c24779a74dc08375ac24e36d6bf6`, remains active and unchanged.
- The UI did not expose a ruleset version; no API token was created to obtain
  one. The original empty inventory, exact rule ID, persisted configuration,
  screenshots and public response receipts are retained instead.

The `metardu-tunnel` dashboard shows two healthy replicas and exactly two
published application routes, `metardu.space` and `www.metardu.space`, both to
`http://localhost:3000`. Both hostnames are covered by the rule and were probed.
No route, replica, token or unrelated tunnel was changed. This is the observed
METARDU tunnel scope, not an assertion about every possible account/domain or
unknown ingress outside it.

At **2026-10-25T22:11:16.829Z**, 24 independent public HTTP checks passed:

| Checks, repeated on both hostnames | Result |
| --- | --- |
| Canonical parcel lookup; v1, v2 and v99 aliases | 403, Cloudflare, no challenge |
| Uppercase path; encoded slashes; singly/doubly encoded letters | 403, Cloudflare, no challenge |
| `/api/public/health` | 200 |
| `/` and `/login` | 200 |
| Anonymous `/dashboard` | 307 to the expected login URL |

All lookup probes used only the reserved nil UUID. They did not return the
legacy missing-record response or request a real customer record. Example
Cloudflare rays: canonical `a5048e251ba7e4ae-OTP`, v1
`a5048e265e31e4ae-OTP`, doubly encoded `a5048e2c2b89e4ae-OTP`, www canonical
`a5048e439c54e468-OTP`, health `a5048e2ea8d9e4ae-OTP`.

CUA also loaded the existing authorized production browser session: visiting
`/login` correctly opened `/dashboard`, whose project register and navigation
rendered. Its recent-activity area reports `Activity could not be refreshed`;
this is a separate unresolved application observation, not a successful full
dashboard acceptance or an established consequence of this API-path block.
No browser storage, project, drawing or account was edited. No valid public
share is expected to work while this temporary block is active.

Local evidence under `.cache/parcel-draft-sharing/`:
`containment-edge-verification.json` (all paths, response hashes and rays),
`cloudflare-before.png`, `cloudflare-prepared.txt`, `cloudflare-active.txt`,
`cloudflare-active.png`, `cloudflare-guard-settings.png` and
`cloudflare-tunnel-routes.txt`. These are local evidence, not public artifacts.

`npm run docker:verify` passed again after the rule was applied: all required
services remain healthy/running, one application container, and the same
application/migration pair. The backup verifier reports archive/header evidence
from 2026-10-25T16:59:14Z; restore recovery remains unproved. No app/worker image,
production file, database, migration, DNS, global security/cache setting or
tunnel/service was changed. Do not hot-patch the running image or bypass the
rejected customer clone to pretend this is a verified release.

## Removal and rollback boundary

Keep containment until the capability handler/schema is promoted and validated
with ordinary authorized and unauthorized identities. Removing it must be a
separate verified step: the valid capability workflow needs the public API.
If an old image is restored, preserve/reapply containment before accepting public
traffic. Source rollback must not silently reopen the anonymous project-ID path.
Full release, worker, recovery, signing-key deferral, receiving-CAD and field
gates remain open.
