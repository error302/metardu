# Incident — `metardu.space` served an unrelated application (2026-11-24)

## Summary

`https://metardu.space` began serving a different application's content
instead of METARDU. The cause was an ambiguous origin address in the
Cloudflare Tunnel ingress rules, combined with a second project's dev
server squatting on the IPv6 loopback port. The public hostname was
healthy at the DNS and tunnel layers and broken at exactly one layer
below: the origin address.

Resolved the same day by pinning the tunnel ingress to the explicit IPv4
loopback address. No container was rebuilt, no container was duplicated,
and no other project's process was stopped.

## Impact

- `metardu.space` and `www.metardu.space` served the wrong application to
  public visitors.
- During the same window the tunnel logged repeated origin failures:
  `malformed HTTP response "Unauthorized"` and
  `Incoming request ended abruptly: context canceled`.
- The METARDU application itself was never faulty: `127.0.0.1:3000`
  returned the correct METARDU page throughout.

## Root cause

The tunnel ingress rule was:

```yaml
- hostname: metardu.space
  service: http://localhost:3000
```

`localhost` is not one address. On this Windows host it resolves to both
`127.0.0.1` (IPv4) and `::1` (IPv6).

- METARDU's container publishes **IPv4 only**:
  `127.0.0.1:3000->3000/tcp`.
- An unrelated project's dev server (`next dev -p 3000`, started
  2026-11-24 17:20) listened on the **IPv6 wildcard** `::` and therefore
  on `[::1]:3000`.

The connector resolved `localhost` to the IPv6 address, so requests for
the public hostname were proxied to the other process. Nothing in METARDU
guessed, cached or rewrote content — the tunnel was faithfully delivering
traffic to the wrong origin.

### Why the local config was not the cause

`C:\Users\user\.cloudflared\config.yml` already used `http://127.0.0.1:3000`
and was correct. It was also **not in effect**: both running connectors
use `--token-file`, which loads a **remotely managed** tunnel whose
ingress rules live in the Cloudflare dashboard. The live rules
(tunnel config v5) still said `localhost`. Editing the local file would
have changed nothing.

## Evidence

| Check | Result |
|---|---|
| `curl http://127.0.0.1:3000/` | 200, title `METARDU - Precise earth measurements.` |
| `curl http://[::1]:3000/` | Connection to the other project's dev server |
| DNS `metardu.space` | CNAME → `388a6a1a-…cfargotunnel.com`, proxied — correct |
| Tunnel `metardu-tunnel` | healthy, connectors from this host |
| Tunnel remote config (v5) | ingress `http://localhost:3000` — the defect |
| `tunnel-named-repair.log` | `malformed HTTP response "Unauthorized"` |

## Resolution

Updated the remotely managed tunnel ingress from `http://localhost:3000`
to `http://127.0.0.1:3000` for `metardu.space` and `www.metardu.space`
(tunnel config v5 → v6). The remote-managed tunnel applies the change
without a connector restart.

Verified after the change:

| Check | Result |
|---|---|
| `https://metardu.space/` | 200, `METARDU - Precise earth measurements.` |
| `https://www.metardu.space/` | 200, same title |
| `https://metardu.space/api/health` | 200 |
| `https://metardu.space/login` | 200 |
| Baby-shop content markers in responses | none |
| `npm run docker:verify` | all 6 services healthy, one app container, exit 0 |

## Prevention

1. **The origin address is now explicit.** `docs/deployment/duckdns-cloudflare-tunnel.md`
   instructs `127.0.0.1:3000` and explains why `localhost` is unsafe on
   Windows.
2. **Remote ingress is the source of truth for token-based tunnels.**
   The runbook now says to check the dashboard/API rather than assume the
   local `config.yml` is what runs.
3. **Do not share port 3000 with another project.** If another dev server
   must bind the same port, it must not listen on the IPv6 wildcard.

## Notes and limits

- The other project's dev server was left running: it is not METARDU's to
  stop, and the fix does not require stopping it.
- Two connectors run this tunnel (a Windows service and a manual
  connector) with the same token. This is deliberate redundancy; both
  load the same remote rules, so a remote-config fix reaches both.
- No release, image rebuild or container promotion was involved in this
  incident. The running production image was unchanged throughout.
