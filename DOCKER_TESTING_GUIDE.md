# METARDU Docker Testing Environment Guide

## 🎯 Purpose

This Docker-based testing environment provides an **enterprise-grade, production-ready** setup that:
- ✅ Mirrors your Google Cloud VM exactly (PostgreSQL + PostGIS + Next.js)
- ✅ Runs automated tests against real data
- ✅ Catches bugs before they reach production
- ✅ Follows security best practices (no hardcoded secrets, least-privilege DB)
- ✅ Scales from local development to production

---

## 📋 Prerequisites

- Docker Desktop installed on your PC
- Node.js 20+ installed
- Your NVIDIA API key (already configured)

---

## 🚀 Quick Start

### 1. Setup Environment

```bash
# Copy test environment template
cp .env.test .env.test.local

# Edit .env.test.local if needed (already configured with defaults)
```

### 2. Start Testing Environment

```bash
# Start full stack (PostgreSQL + Next.js + Test Runner)
npm run docker:test

# This will:
# - Build Docker images
# - Start PostgreSQL with PostGIS
# - Start Next.js app on port 3001
# - Run automated tests
# - Generate reports
```

### 3. View Results

```bash
# Open test results in browser
open live-test-results/report.html

# Or view in file explorer:
# C:\Users\ADMIN\Desktop\Survey -ENG\live-test-results\report.html
```

### 4. Stop Environment

```bash
# Stop all containers and clean up
npm run docker:test:down
```

---

## 🧪 What Gets Tested

### Automated Test Suite

| Test | Description | Status |
|------|-------------|--------|
| **Authentication** | Login page loads, form exists | ✅ Auto |
| **Project Creation** | New project form accessible | ✅ Auto |
| **Traverse Computation** | Computation engine works | ✅ Auto |
| **Levelling Computation** | Level book functions | ✅ Auto |
| **Area Computation** | Coordinate-based area calc | ✅ Auto |
| **Survey Report Builder** | Report generation UI | ✅ Auto |
| **PDF Export** | Server-side PDF generation | ✅ Auto |
| **DOCX Export** | Word document generation | ✅ Auto |
| **Database Connection** | PostgreSQL + PostGIS | ✅ Auto |
| **Security Headers** | CSP, HSTS, etc. | ✅ Auto |

### Manual Testing Checklist

- [ ] Login with test account
- [ ] Create new survey project
- [ ] Enter field data
- [ ] Run traverse computation
- [ ] Generate survey report
- [ ] Export PDF
- [ ] Export DOCX
- [ ] Check error handling

---

## 🔧 Commands

### Docker Commands

```bash
# Start environment
npm run docker:test

# View logs
npm run docker:test:logs

# Stop and cleanup
npm run docker:test:down

# Rebuild images
npm run docker:test -- --build
```

### Test Commands

```bash
# Run live browser tests
npm run test:live

# Run security audit
npm run test:security

# Run computation tests
npm run test:engineering
```

---

## 🛡️ Security Features

### 1. Database Security

- ✅ **Least-privilege user**: `metardu_test_user` has minimal permissions
- ✅ **Isolated network**: Docker network `172.28.0.0/16`
- ✅ **No root access**: Containers run as non-root user
- ✅ **Port isolation**: Test DB on 5433 (production on 5432)

### 2. Application Security

- ✅ **Environment variables only**: No hardcoded secrets
- ✅ **Secure headers**: CSP, HSTS, X-Frame-Options
- ✅ **Input validation**: Zod schemas on all inputs
- ✅ **Parameterized queries**: No SQL injection risk
- ✅ **Rate limiting**: API protected from abuse

### 3. Authentication Security

- ✅ **Secure AUTH_SECRET**: 32+ character random string
- ✅ **JWT best practices**: Short expiry, secure cookies
- ✅ **Admin role checks**: Middleware enforces permissions
- ✅ **Row-level security**: User data isolated

---

## 📊 Test Results

### Where to Find Results

```
live-test-results/
├── report.html              # HTML report with screenshots
 ├── login-page.png          # Screenshot: Login page
├── project-creation.png     # Screenshot: Project form
├── traverse-computation.png # Screenshot: Traverse tool
├── survey-report-builder.png# Screenshot: Report builder
├── dashboard.png            # Screenshot: Dashboard
└── test-results.json        # Raw JSON results
```

### Interpreting Results

**PASS**: Feature working as expected  
**FAIL**: Bug detected - check screenshot and error message  
**SKIP**: Test skipped (missing dependency)

---

## 🐛 Debugging

### Common Issues

#### 1. Containers Won't Start

```bash
# Check Docker is running
docker ps

# Check ports not in use
netstat -ano | findstr :3001
netstat -ano | findstr :5433

# Free up ports or change in .env.test.local
```

#### 2. Database Connection Fails

```bash
# Check DB health
docker-compose -f docker-compose.testing.yml ps postgres

# View DB logs
docker-compose -f docker-compose.testing.yml logs postgres

# Reset database
docker-compose -f docker-compose.testing.yml down -v
docker-compose -f docker-compose.testing.yml up --build
```

#### 3. Tests Timeout

```bash
# Increase timeout in live-browser-test.ts
const BASE_URL = 'http://localhost:3001'
const TIMEOUT = 30000 // Increase to 30s
```

---

## 📈 Production Deployment

### Before Deploying to Google Cloud VM

1. **Run Security Audit**
   ```bash
   npm run test:security
   ```

2. **Run All Tests**
   ```bash
   npm test && npm run test:live
   ```

3. **Check Production Readiness**
   - See `PRODUCTION_READINESS.md`
   - Complete checklist items

4. **Deploy**
   ```bash
   git push origin main
   ```

5. **Verify Deployment**
   ```bash
   curl -sf https://metardu.duckdns.org/api/public/health
   ```

---

## 🎯 Next Steps

### Phase 1: Local Testing (Current)
- ✅ Docker environment setup
- ✅ Automated browser tests
- ✅ Security audit
- [ ] Fix any failing tests

### Phase 2: CI/CD Integration
- [ ] GitHub Actions workflow
- [ ] Auto-test on push
- [ ] Auto-deploy on main branch

### Phase 3: Production Monitoring
- [ ] Sentry integration
- [ ] Uptime monitoring
- [ ] Alert configuration

---

## 📞 Support

If you encounter issues:

1. Check logs: `npm run docker:test:logs`
2. Review error messages in test report
3. Verify environment variables in `.env.test.local`
4. Check Docker Desktop for container status

---

## 🎓 Learning Resources

- [Docker Compose documentation](https://docs.docker.com/compose/)
- [Playwright testing guide](https://playwright.dev/docs/intro)
- [Next.js security best practices](https://nextjs.org/docs/pages/building-your-application/authentication)
- [PostgreSQL security](https://www.postgresql.org/docs/current/security.html)

---

**Last Updated:** 2026-04-19  
**Version:** 1.0.0  
**Status:** Production Ready ✅
