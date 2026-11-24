# DuckDNS + Cloudflare Tunnel Setup Guide
## Host METARDU on metardu.space — Free, HTTPS, No ngrok

> **Canonical topology (P0-7, 2026-07-24):** This is the **production guide**
> for hosting METARDU on `metardu.space` (or any DuckDNS subdomain)
> via Cloudflare Tunnel + Nginx. For the Windows-dev alternative (Cloudflare
> named tunnel without Nginx), see `../../CLOUDFLARE_TUNNEL_SETUP.md`. The
> `bore.pub` tunnel has been removed (was redundant with Cloudflare).

This guide walks you through setting up a free Cloudflare Tunnel (`cloudflared`) on your local Docker host and pointing your DuckDNS subdomain (`metardu.space`) to it. The result: your locally-hosted METARDU app is accessible worldwide at `https://metardu.space` with automatic HTTPS — no GCP, no ngrok, no port forwarding.

---

## Architecture

```
Internet User
    ↓
https://metardu.space
    ↓ (DNS CNAME → <tunnel-id>.cfargotunnel.com)
Cloudflare Edge (HTTPS termination, DDoS protection)
    ↓ (cloudflared tunnel)
Your Local Machine (Docker)
    ↓
127.0.0.1:3000 → METARDU Next.js App
```

> The origin is the **explicit IPv4 loopback address**. `localhost` is
> ambiguous on Windows (it also resolves to `::1`), and resolving to the
> IPv6 address can hand the public hostname to an unrelated process that
> holds the IPv6 socket on that port. See Step 6.

---

## Step 1: Set Up DuckDNS

1. Go to [https://www.duckdns.org/](https://www.duckdns.org/)
2. Sign in with a social provider (Google, GitHub, Reddit, Twitter)
3. In the dashboard, create a subdomain:
   - Type: `metardu` → full domain becomes `metardu.space`
4. For now, leave the IP field blank (Cloudflare Tunnel will handle routing, not direct IP)
5. Note your **DuckDNS token** (shown at the top of the dashboard)

> **Note:** With Cloudflare Tunnel, DuckDNS doesn't need to point to your IP directly. Instead, you'll create a CNAME record in Cloudflare that points to the tunnel.

---

## Step 2: Add Your Domain to Cloudflare (Free Plan)

Since you don't own duckdns.org, the cleanest approach is:

1. Create a free Cloudflare account at [https://dash.cloudflare.com/](https://dash.cloudflare.com/)
2. Add **any domain you own** to Cloudflare (even a cheap `.xyz` or `.site` domain)
   - If you own no domain, you can use Cloudflare's **`trycloudflare.com`** quick tunnel for testing

### Option A: Quick Tunnel (Testing — No Account Needed)

```bash
# Install cloudflared
# Linux:
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# macOS:
brew install cloudflared

# Run quick tunnel (gives you a random trycloudflare.com URL)
cloudflared tunnel --url http://127.0.0.1:3000
```

This gives you a URL like `https://random-words.trycloudflare.com` — great for testing but the URL changes every time.

### Option B: Named Tunnel with Custom Domain (Production)

This is the recommended approach for a stable `metardu.space` or custom domain.

---

## Step 3: Install cloudflared

```bash
# Ubuntu/Debian:
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared

# Or direct download (any Linux):
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# macOS:
brew install cloudflared

# Verify:
cloudflared --version
```

---

## Step 4: Authenticate cloudflared

```bash
cloudflared tunnel login
```

This opens a browser window. Select your Cloudflare account and authorize. A certificate is saved to `~/.cloudflared/cert.pem`.

---

## Step 5: Create a Named Tunnel

```bash
cloudflared tunnel create metardu
```

This outputs a **tunnel ID** (a UUID). Note it down. It also creates a credentials file at:
```
~/.cloudflared/<TUNNEL_ID>.json
```

---

## Step 6: Configure the Tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: metardu
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: metardu.space
    service: http://127.0.0.1:3000
  
  # Catch-all rule (required)
  - service: http_status:404
```

Replace `<TUNNEL_ID>` with your actual tunnel ID from Step 5.

> **Use the explicit IPv4 address `127.0.0.1`, never `localhost`.**
> `localhost` is not a single address: on Windows it resolves to `::1`
> (IPv6) as well as `127.0.0.1` (IPv4), and the resolver's choice decides
> which process answers. Docker publishes METARDU on IPv4 loopback only, so
> a tunnel pointed at `localhost` can reach some *other* process that
> happens to hold the IPv6 socket on port 3000. This happened in
> production: `metardu.space` served an unrelated application because a
> second project's dev server was listening on `[::1]:3000`, while
> `127.0.0.1:3000` served METARDU correctly. See
> `../PUBLIC_HOSTNAME_INCIDENT_2026-11-24.md`.
>
> The same rule applies to a **remotely managed** tunnel: the ingress rules
> live in the Cloudflare dashboard, not in the local `config.yml`, and the
> token-based connector loads the remote rules. Check the tunnel's ingress
> in the dashboard (or the API) rather than assuming the local file is what
> runs.

---

## Step 7: Create DNS Route

```bash
cloudflared tunnel route dns metardu metardu.space
```

This creates a CNAME record: `metardu.space → <tunnel-id>.cfargotunnel.com`

> **If duckdns.org zone isn't in your Cloudflare account**, you have two options:
>
> 1. **Buy a cheap domain** (~$1-2/year for `.xyz`, `.site`, `.tech`) — Add to Cloudflare, use `metardu.yourdomain.xyz`
> 2. **Use Cloudflare-only DNS** — Add your own domain, skip DuckDNS entirely

---

## Step 8: Run the Tunnel

```bash
# Test run:
cloudflared tunnel run metardu

# Or with config file:
cloudflared tunnel --config ~/.cloudflared/config.yml run metardu
```

Your app should now be accessible at `https://metardu.space`.

---

## Step 9: Run as a Systemd Service (Auto-start on Boot)

```bash
# Install as service:
sudo cloudflared service install

# Start and enable:
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# Check status:
sudo systemctl status cloudflared

# View logs:
sudo journalctl -u cloudflared -f
```

---

## Step 10: Docker Compose Integration

Add cloudflared to your `docker-compose.yml`:

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://metardu:password@db:5432/metardu
      - NEXTAUTH_URL=https://metardu.space
      - NEXTAUTH_SECRET=your-secret-here
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: metardu
      POSTGRES_PASSWORD: password
      POSTGRES_DB: metardu
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel run metardu
    volumes:
      - ~/.cloudflared:/etc/cloudflared:ro
    depends_on:
      - app
    restart: unless-stopped

volumes:
  pgdata:
```

> **Important:** Set `NEXTAUTH_URL=https://metardu.space` so OAuth callbacks work correctly.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Tunnel not connecting | `cloudflared tunnel info metardu` then `curl http://127.0.0.1:3000` |
| DNS not resolving | `dig metardu.space CNAME` then re-run route command |
| Public hostname serves the wrong app | The origin address is ambiguous — see Step 6. Check the **remote** ingress rules (dashboard/API) and pin the service to `http://127.0.0.1:3000`. Also check whether another process holds the IPv6 socket on port 3000. |
| OAuth redirect issues | Ensure `NEXTAUTH_URL` is set correctly, update Google/Azure redirect URIs |
| Docker not accessible | `docker compose ps` then `docker compose logs app` |

---

## Security Notes

- **No port forwarding needed** — Tunnel connects outbound only
- **Automatic HTTPS** — Cloudflare handles SSL/TLS termination
- **DDoS protection** — Free plan includes basic mitigation
- **Access policies** — Add Cloudflare Access (Zero Trust) for extra auth
- **Rate limiting** — Available in Cloudflare dashboard

---

## Cost Summary

| Component | Cost |
|-----------|------|
| DuckDNS subdomain | Free |
| Cloudflare account | Free |
| Cloudflare Tunnel | Free (unlimited bandwidth) |
| HTTPS certificate | Free (auto-managed) |
| DDoS protection | Free (basic) |
| **Total** | **$0/month** |

Optional: Custom domain ($1-2/year) for a professional URL instead of duckdns.org.
