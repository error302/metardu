#!/usr/bin/env bash
set -euo pipefail

echo "=== METARDU Deploy Script ==="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Step 1: Pull latest code
echo -e "${YELLOW}[1/6] Pulling latest code...${NC}"
git pull origin main

# Step 2: Install dependencies
echo -e "${YELLOW}[2/6] Installing dependencies...${NC}"
npm ci --production=false  # Need devDependencies for build

# Step 3: Run database migrations
echo -e "${YELLOW}[3/6] Running database migrations...${NC}"
if [ -f "scripts/run-migrations.js" ]; then
  node scripts/run-migrations.js 2>&1 || echo -e "${RED}Migration failed (non-fatal)${NC}"
else
  echo "No migration runner found, skipping"
fi

# Step 4: Build
echo -e "${YELLOW}[4/6] Building application...${NC}"
npm run build

# Step 5: Install production deps only
echo -e "${YELLOW}[5/6] Installing production dependencies...${NC}"
npm ci --production

# Step 6: Restart PM2
echo -e "${YELLOW}[6/6] Restarting PM2...${NC}"
pm2 restart ecosystem.config.cjs --env production 2>/dev/null || \
  pm2 start ecosystem.config.cjs --env production

echo -e "${GREEN}=== Deploy complete ===${NC}"
pm2 status
