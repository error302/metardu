# METARDU Production Runbook

METARDU is currently standardized on a single production path:

- Build Next.js with `output: "standalone"`
- Run one PM2 process from `.next/standalone/server.js`
- Do not run Docker and PM2 side by side while stabilizing the app

## Canonical Production Flow

```bash
npm install
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

For updates:

```bash
git pull
npm install
npm run build
pm2 reload ecosystem.config.cjs --update-env
```

## Runtime Shape

- Process manager: `pm2`
- Entry point: `.next/standalone/server.js`
- Port: `3000`
- Memory cap: `--max-old-space-size=768`
- PM2 restart threshold: `900M`

The canonical PM2 config lives in [ecosystem.config.cjs](/C:/Users/ADMIN/Desktop/Survey%20-ENG/ecosystem.config.cjs).

## Health Checks

Use these commands after each deploy:

```bash
pm2 status
pm2 logs metardu --lines 100
free -h
curl -I http://127.0.0.1:3000
```

If Nginx or Caddy is fronting the app, also verify the public site:

```bash
curl -I https://metardu.duckdns.org
```

## Recovery Checklist

1. Confirm only one runtime path is active.
2. Stop any stray Docker container serving the app.
3. Rebuild the standalone output.
4. Reload PM2 with the canonical config.
5. Verify RAM after boot and after opening the main routes.

## Docker Status

`Dockerfile` and `docker-compose.yml` remain in the repo for future experiments and fallback work, but they are not the active production recovery path during this stabilization phase.

## UI Verification Routes

After each deploy, verify these routes in both desktop and mobile layouts:

- `/`
- `/docs`
- `/dashboard`
- `/projects`
- `/community`
- `/account`

## Notes

- Authenticated users should always land in the METARDU app shell.
- Public/docs pages can keep a public shell only while logged out.
- If memory is still pinned after this single-process setup, measure first before changing architecture again.
