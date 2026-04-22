# METARDU Docker Testing Guide

## Quick Start

### Option 1: Using PowerShell Script (Windows)

```powershell
# Start the testing environment
.\scripts\run-docker-tests.ps1

# View logs
.\scripts\run-docker-tests.ps1 -Logs

# Stop the environment
.\scripts\run-docker-tests.ps1 -Down

# Rebuild from scratch
.\scripts\run-docker-tests.ps1 -Build
```

### Option 2: Using Docker Compose Directly

```bash
# Start the full testing stack
docker compose -f docker-compose.testing.yml up --build -d

# Wait for health check (about 60 seconds)
curl http://localhost:3001/api/public/health

# Run quick smoke tests
npm run test:quick

# Run full browser tests
npm run test:live

# View logs
docker compose -f docker-compose.testing.yml logs -f

# Stop and clean up
docker compose -f docker-compose.testing.yml down -v
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | 5433 | Test database with PostGIS |
| Next.js App | 3001 | METARDU application (test instance) |
| Test Runner | - | Automated browser tests |

## Database

- **User**: `metardu_test`
- **Password**: `TestPass_2026!secure`
- **Database**: `metardu_test`
- **Connection**: `postgresql://metardu_test:TestPass_2026!secure@localhost:5433/metardu_test`

## Test Accounts

Pre-configured in the test database:

- **Admin**: `mohameddosho20@gmail.com` / `Dosho10701$`
- **Test User**: `test.surveyor@metardu.com` / `TestPass123!`

## Running Tests

### Quick Smoke Test (30 seconds)
```bash
npm run test:quick
```

Tests:
- Home page loads
- Login form works
- Dashboard requires auth
- Traverse tool works
- Survey Report Builder works

### Full Browser Test (2-3 minutes)
```bash
npm run test:live
```

Tests:
- Authentication flow
- Login with credentials
- Project creation
- Traverse computation
- Survey Report Builder
- Dashboard access

### Security Audit
```bash
npm run test:security
```

## Troubleshooting

### Port already in use
```bash
# Check what's using port 3001
netstat -ano | findstr :3001

# Stop any existing containers
docker compose -f docker-compose.testing.yml down -v
```

### Database not connecting
```bash
# Check postgres container logs
docker compose -f docker-compose.testing.yml logs postgres

# Reset database
docker volume rm metardu_postgres_test_data
docker compose -f docker-compose.testing.yml up -d
```

### App not starting
```bash
# Check app logs
docker compose -f docker-compose.testing.yml logs metardu-app

# Rebuild from scratch
docker compose -f docker-compose.testing.yml down -v
docker compose -f docker-compose.testing.yml up --build -d
```

## Production Parity

This Docker environment mirrors your Google Cloud VM:

- ✅ PostgreSQL 15 + PostGIS 3.3
- ✅ Node.js 20 Alpine
- ✅ Same environment variables
- ✅ Same build process
- ✅ Health checks configured

## CI/CD Integration

Add to GitHub Actions:

```yaml
- name: Run Docker Tests
  run: |
    docker compose -f docker-compose.testing.yml up --build -d
    sleep 60
    curl -f http://localhost:3001/api/public/health
    npm run test:quick
    docker compose -f docker-compose.testing.yml down -v
```

## Next Steps

1. ✅ Basic Docker setup complete
2. ⏳ Add end-to-end test scenarios for all survey types
3. ⏳ Test document generation (PDF/DOCX)
4. ⏳ Add load testing
5. ⏳ Add security penetration testing
