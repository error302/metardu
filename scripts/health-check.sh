#!/bin/bash
MEM_FREE=$(free -m | awk '/^Mem:/{print $4}')
SWAP_USED=$(free -m | awk '/^Swap:/{print $3}')
APP_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; apps=json.load(sys.stdin); print(next((a['pm2_env']['status'] for a in apps if a['name']=='metardu'), 'missing'))" 2>/dev/null || echo "pm2_missing")

if [ "$APP_STATUS" != "online" ]; then
  echo "[$(date)] ALERT: Metardu is $APP_STATUS — restarting"
  pm2 restart metardu 2>/dev/null
fi

if [ "$MEM_FREE" -lt "200" ]; then
  echo "[$(date)] WARNING: Free RAM = ${MEM_FREE}MB — low memory"
fi

if [ "$SWAP_USED" -gt "3000" ]; then
  echo "[$(date)] CRITICAL: Swap usage = ${SWAP_USED}MB — OOM risk"
fi
