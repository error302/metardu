#!/usr/bin/env bash
# METARDU Production Operations Setup
# Run once on the VM to configure backups, monitoring, and cron jobs

set -euo pipefail

METARDU_DIR="/home/mohameddosho20/metardu"
LOG_DIR="$METARDU_DIR/logs"
BACKUP_DIR="$METARDU_DIR/backups"

echo "=== METARDU Operations Setup ==="
echo ""

# 1. Create directories
echo "Creating directories..."
mkdir -p "$LOG_DIR" "$BACKUP_DIR"

# 2. Install bc for health check math
echo "Installing dependencies..."
sudo apt-get update -qq && sudo apt-get install -y -qq bc postgresql-client > /dev/null 2>&1
echo "Dependencies installed ✓"

# 3. Setup backup cron (daily at 2 AM)
echo "Configuring daily backup cron..."
BACKUP_CRON="0 2 * * * $METARDU_DIR/scripts/backup.sh >> $LOG_DIR/backup.log 2>&1"
(crontab -l 2>/dev/null | grep -v "backup.sh"; echo "$BACKUP_CRON") | crontab -
echo "Backup cron: daily at 2:00 AM ✓"

# 4. Setup health check cron (every 5 minutes)
echo "Configuring health check cron..."
HEALTH_CRON="*/5 * * * * $METARDU_DIR/scripts/health-check.sh >> $LOG_DIR/health-check.log 2>&1"
(crontab -l 2>/dev/null | grep -v "health-check.sh"; echo "$HEALTH_CRON") | crontab -
echo "Health check cron: every 5 minutes ✓"

# 5. Setup log rotation
echo "Configuring log rotation..."
sudo tee /etc/logrotate.d/metardu > /dev/null << 'EOF'
/home/mohameddosho20/metardu/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    copytruncate
}
EOF
echo "Log rotation: 14-day retention ✓"

# 6. Verify PM2 startup
echo "Configuring PM2 startup..."
pm2 startup systemd -u mohameddosho20 --hp /home/mohameddosho20 2>/dev/null || true
pm2 save 2>/dev/null || true
echo "PM2 startup: configured ✓"

# 7. Run initial backup
echo "Running initial backup..."
chmod +x "$METARDU_DIR/scripts/backup.sh"
"$METARDU_DIR/scripts/backup.sh"
echo "Initial backup complete ✓"

# 8. Test health check
echo "Running test health check..."
chmod +x "$METARDU_DIR/scripts/health-check.sh"
"$METARDU_DIR/scripts/health-check.sh" || true
echo "Health check test complete ✓"

# 9. Create health API endpoint instructions
echo ""
echo "=== Next Steps ==="
echo "1. Set ALERT_WEBHOOK_URL in .env.local for Slack/Discord alerting"
echo "2. Create /app/api/health/route.ts endpoint (returns 200 OK)"
echo "3. Set GCS_BUCKET_NAME in .env.local for cloud backup uploads"
echo "4. Verify Let's Encrypt SSL: sudo certbot certificates"
echo "5. Switch PayPal to live: PAYPAL_MODE=live in .env.local"
echo ""
echo "=== Cron Jobs Installed ==="
crontab -l
echo ""
echo "Setup complete!"
