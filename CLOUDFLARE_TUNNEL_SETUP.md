# Cloudflare Named Tunnel Setup (METARDU)

> **Canonical topology (P0-7, 2026-07-24):** Production `metardu.space` runs
> behind Cloudflare DNS/protection → Nginx (TLS via Certbot) → Next.js on
> port 3000. This document is the **Windows-dev alternative** for surveyors
> running METARDU on a Windows machine without Nginx — it uses a Cloudflare
> named tunnel directly to `localhost:3000`. For the Linux/DuckDNS production
> guide, see `docs/deployment/duckdns-cloudflare-tunnel.md`. The `bore.pub`
> tunnel has been removed (was redundant with Cloudflare).

## Why a named tunnel?
- Provides a **stable hostname** (e.g. `https://<YOUR_DOMAIN>.com`).
- No need to rewrite environment variables on every restart.
- Runs as a Windows service, so it stays alive even if the app container restarts.
- Avoids the `530` error you saw when the quick tunnel’s host header did not match the app’s `NEXTAUTH_URL`.

## Steps (run once)
1. **Create a Cloudflare account** (free tier is fine) and add a domain you own (free options: Freenom, .tk, .ml, etc.) or use an existing domain you control.
2. Install the Cloudflare CLI (`cloudflared`) if not already installed.
3. Open a PowerShell terminal **as the same user** that runs the METARDU scripts.
4. Create the tunnel and generate a credential file:
   ```powershell
   cloudflared tunnel create metardu
   ```
   This prints a tunnel ID and writes a JSON credential file to `%USERPROFILE%\.cloudflared\<NAME>.json`.
5. **Reserve a DNS name** for the tunnel (replace `<YOUR_DOMAIN>.com` with the name you want):
   ```powershell
   cloudflared tunnel route dns metardu <YOUR_DOMAIN>.com
   ```
6. Create a config file (`%USERPROFILE%\.cloudflared\config.yml`) that points to the credential:
   ```yaml
   tunnel: <TUNNEL-ID-from-step-4>
   credentials-file: C:\Users\user\.cloudflared\<NAME>.json
   ingress:
     - hostname: <YOUR_DOMAIN>.com
       service: http://127.0.0.1:3000
     - service: http_status:404
   ```
7. **Install the tunnel as a Windows service** so it starts automatically on login:
   ```powershell
   cloudflared service install
   ```
   The service will be named `cloudflared`. Verify it is running with `Get-Service cloudflared`.
8. **Update METARDU configuration**:
   - The `docker-compose.yml` already contains static URLs (`https://<YOUR_DOMAIN>.com`). If you chose a different hostname, replace `<YOUR_DOMAIN>.com` in the three `NEXT*` variables.
   - No further URL‑capture is needed.
9. Restart METARDU:
   ```powershell
   .\stop-metardu.bat   # stops Docker and any quick-tunnel processes
   .\start-metardu.bat  # starts Docker containers and creates a new quick tunnel for this session
   ```
   The app will be reachable at the tunnel URL printed in the console.

   **Note:** `start-metardu.ps1` creates a temporary quick tunnel on each run, updates `docker-compose.yml` with the new tunnel URL, and rebuilds the app container. Each session gets a fresh tunnel URL, which is written to `tunnel-url.txt`. If you prefer a stable hostname, use the named-tunnel approach described above and manage `start-metardu.ps1` to skip the quick-tunnel creation when the named tunnel is already running as a service.

## Verifying the setup
- Open a browser to the hostname (e.g. `https://<YOUR_DOMAIN>.com`).
- You should see the METARDU UI with HTTP 200 responses.
- `curl -I https://<YOUR_DOMAIN>.com` should return `200 OK`.

## Troubleshooting
- **530 errors**: ensure the hostname in `docker-compose.yml` matches the DNS entry you created.
- **Service not running**: `Get-Service cloudflared` → `Start-Service cloudflared`.
- **Port conflict**: the tunnel forwards to `127.0.0.1:3000`; make sure no other process uses that port.

Once the service is up, you can simply run `start-metardu.bat` to spin up the containers; the tunnel will stay active in the background.

## WebSocket collaboration (verified 2026-11-14)

The collaboration socket is same-origin: the browser opens
`wss://metardu.space/ws/collaboration`, and `next.config.js` rewrites that path
(only when the request carries `Upgrade: websocket` and
`NEXT_PUBLIC_COLLABORATION_SAME_ORIGIN=1`) to
`http://metardu-collaboration:3001/ws/collaboration`.

Consequences for the tunnel:

- **No extra ingress rule is needed.** The existing hostname rule to
  `http://127.0.0.1:3000` already carries the upgrade; the app container proxies
  it to the collaboration container over the Docker network.
- **Port 3001 must NOT be published or tunnelled.** It is `expose`d only, which
  keeps the room service off the host and off the internet.
- Verified end-to-end with a fake room ticket: the public socket reached the
  collaboration server and was closed by its own check with `1008 Project room
  access denied`. `/api/realtime/ticket` answers `401` when signed out.

If you ever want the tunnel to reach the room service directly instead, you must
do both of these (neither is currently done, and neither is required):

1. publish the port in `docker-compose.yml` (`127.0.0.1:3001:3001`), and
2. add an ingress rule above the catch-all in the Cloudflare dashboard:

   ```yaml
   - hostname: metardu.space
     path: /ws/collaboration
     service: http://127.0.0.1:3001
   - hostname: metardu.space
     service: http://127.0.0.1:3000
   ```

   That also means the Next rewrite should be removed so there is only one path.

### Rebuild after changing any NEXT_PUBLIC_* value

```bash
docker compose build metardu-app
docker compose up -d --no-deps metardu-app
```

`docker compose restart metardu-app` is not enough: the value lives in the
compiled client bundle, so the image has to be rebuilt.
