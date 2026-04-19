# METARDU Production Readiness Checklist

## ✅ Pre-Deployment Verification

### 1. Security Audit

```bash
# Run automated security scan
npm run security:audit

# Check for Supabase remnants
grep -r "createClient\|@supabase" src/ --include="*.ts" --include="*.tsx"

# Verify no hardcoded secrets
grep -r "sk_live_\|pk_live_\|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" .env* src/
```

**Status:** [ ] PASSED

---

### 2. Database Security

- [ ] Database password rotated from default
- [ ] PostgreSQL user has least-privilege permissions
- [ ] `password_reset_tokens` table NOT in ALLOWED_TABLES
- [ ] `users` table NOT directly accessible via /api/db
- [ ] Row-level security enforced (user_id scoping)
- [ ] Database port 5432 firewalled (localhost only)

**Status:** [ ] PASSED

---

### 3. Authentication & Authorization

- [ ] AUTH_SECRET is cryptographically secure (32+ random chars)
- [ ] JWT maxAge reduced to 7 days (not 30)
- [ ] Admin routes check `ADMIN_EMAILS`
- [ ] Session tokens properly invalidated on logout
- [ ] Password reset uses secure token generation

**Status:** [ ] PASSED

---

### 4. Environment Variables

- [ ] All secrets in environment variables (not hardcoded)
- [ ] `.env.local` in `.gitignore`
- [ ] No production keys in `.env.example`
- [ ] NVIDIA_API_KEY configured
- [ ] Payment gateway keys are REAL (not mock)

**Status:** [ ] PASSED

---

### 5. API Security

- [ ] All API endpoints validate input with Zod
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (sanitized outputs)
- [ ] CSRF protection on state-changing operations
- [ ] Rate limiting configured

**Status:** [ ] PASSED

---

### 6. Docker & Deployment

```bash
# Test local Docker setup
docker-compose -f docker-compose.testing.yml up --build

# Verify health checks
docker-compose -f docker-compose.testing.yml ps

# Run automated tests
docker-compose -f docker-compose.testing.yml exec test-runner npm run test:live
```

- [ ] Docker Compose spins up successfully
- [ ] Health checks pass (app + database)
- [ ] No container crashes
- [ ] Database persists data correctly
- [ ] Network isolation working

**Status:** [ ] PASSED

---

### 7. Data Integrity

- [ ] Automated backups configured
- [ ] Backup restoration tested
- [ ] Data migration scripts tested
- [ ] Rollback procedure documented

**Status:** [ ] PASSED

---

### 8. Monitoring & Logging

- [ ] Sentry configured with real DSN
- [ ] Error tracking active
- [ ] Log aggregation enabled
- [ ] Alert thresholds configured
- [ ] Health check endpoint responding

**Status:** [ ] PASSED

---

### 9. Performance

- [ ] Database queries optimized (no N+1)
- [ ] Images optimized (next/image)
- [ ] Static assets cached
- [ ] Bundle size < 5MB
- [ ] TTFB < 200ms

**Status:** [ ] PASSED

---

### 10. Testing

```bash
# Run full test suite
npm test

# Run live browser tests
npm run test:live

# Run computation engine tests
npm run test:engineering
```

- [ ] All 572 computation tests pass
- [ ] Live browser tests pass (>90%)
- [ ] Security audit passes (0 critical)
- [ ] E2E flow tested (login → project → report)

**Status:** [ ] PASSED

---

### 11. Documentation

- [ ] API documentation updated
- [ ] Deployment guide current
- [ ] Runbook for common issues
- [ ] Contact info for support

**Status:** [ ] PASSED

---

### 12. Payment Gateway

- [ ] Stripe: Real keys configured, test transaction successful
- [ ] M-Pesa: Real credentials, STK push tested
- [ ] PayPal: Sandbox → Production mode switched
- [ ] Payment history table recording correctly

**Status:** [ ] PASSED

---

## 🚀 Deployment Command

```bash
# 1. Run final security audit
npm run security:audit

# 2. Run all tests
npm test && npm run test:live

# 3. Build production bundle
npm run build

# 4. Deploy to Google Cloud VM
git push origin main

# 5. Verify deployment
curl -sf https://metardu.duckdns.org/api/public/health
```

---

## 🔥 Rollback Procedure

If deployment fails:

```bash
# 1. Revert to previous commit
git revert HEAD
git push origin main

# 2. Or restore from backup
pg_restore -h localhost -U metardu -d metardu backup_file.dump

# 3. Verify rollback
curl -sf https://metardu.duckdns.org/api/public/health
```

---

## 📊 Post-Deployment Verification

- [ ] Login works
- [ ] Project creation works
- [ ] Traverse computation works
- [ ] Levelling computation works
- [ ] Survey report generates
- [ ] PDF export works
- [ ] DOCX export works
- [ ] Payment flow works (test mode)

---

## ✅ Final Sign-Off

**Security Audit:** [ ] PASSED  
**Tests:** [ ] PASSED  
**Performance:** [ ] PASSED  
**Documentation:** [ ] PASSED  

**Deployed by:** ________________  
**Date:** ________________  
**Version:** ________________  

---

**Next Steps After Deployment:**
1. Monitor error logs for first 24 hours
2. Check Sentry dashboard daily
3. Review payment transactions
4. Collect user feedback
5. Schedule next security audit (quarterly)
