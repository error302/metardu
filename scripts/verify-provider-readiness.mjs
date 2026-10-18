// Read-only provider diagnostics. Credentials remain in memory; no order,
// subscription, email, account, DNS, consent or production record is changed.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { PLAN_CATALOG } from '../src/lib/subscription/catalog.ts'
import { validatePayPalBillingPlan } from '../src/lib/payments/paypalPlanValidation.ts'

const result = spawnSync('docker', ['inspect', 'metardu-app'], { encoding: 'utf8', windowsHide: true, timeout: 10000 })
assert.equal(result.status, 0, 'Production metadata could not be inspected; diagnostics suppressed.')
const [app] = JSON.parse(result.stdout)
assert.equal(app.Name, '/metardu-app')
assert.equal(app.Config.Labels['com.docker.compose.project'], 'metardu')
assert.equal(app.State.Health.Status, 'healthy')
const env = Object.fromEntries(app.Config.Env.map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)] }))
const report = { checkedAt: new Date().toISOString(), releaseId: env.METARDU_BUILD_SHA, readOnly: true,
  customerRecordsChanged: false, emailSent: false, paymentCreated: false, public: [], paypal: {}, resend: {} }
const save = () => { mkdirSync('.cache/provider-readiness', { recursive: true }); writeFileSync('.cache/provider-readiness/current.json', JSON.stringify(report, null, 2) + '\n') }
const read = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(20000), redirect: 'error' })
const errorName = body => typeof body?.name === 'string' && /^[a-zA-Z_]+$/.test(body.name) ? body.name : 'unavailable'
for (const path of ['/api/public/health', '/api/public/chatgpt-notice', '/api/payments', '/metardu-email-mark.png']) {
  try {
    const response = await read('https://metardu.space' + path, path.endsWith('.png') ? { method: 'HEAD' } : {})
    const body = path.endsWith('.png') ? null : await response.json()
    report.public.push({ path, status: response.status, ...(path.endsWith('/health') ? { healthy: body.status === 'healthy', releaseId: body.releaseId }
      : path.endsWith('chatgpt-notice') ? { state: body.state, eligible: body.eligible, linkingConfigured: body.linkingConfigured, eligibleAt: body.eligibleAt }
      : path.endsWith('/payments') ? { providers: body.providers } : { type: response.headers.get('content-type') }) })
  } catch { report.public.push({ path, status: 'unreachable' }) }
}
save()
if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) report.paypal = { state: 'credentials_missing' }
else {
  assert.ok(['live', 'sandbox'].includes(env.PAYPAL_MODE || 'sandbox'), 'Unknown PayPal mode; no credentials transmitted.')
  const base = env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
  try {
    const response = await read(base + '/v1/oauth2/token', { method: 'POST', headers: {
      Authorization: 'Basic ' + Buffer.from(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_CLIENT_SECRET).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    }, body: 'grant_type=client_credentials' })
    const auth = await response.json()
    report.paypal = { mode: env.PAYPAL_MODE || 'sandbox', tokenStatus: response.status, plans: [] }
    if (response.ok && typeof auth.access_token === 'string') {
      const jobs = PLAN_CATALOG.filter(plan => ['pro', 'team', 'firm'].includes(plan.id)).flatMap(plan =>
        ['USD', 'EUR', 'GBP', 'AUD'].map(currency => ({ plan, currency, key: `PAYPAL_PLAN_${plan.id.toUpperCase()}_${currency}` })))
      for (let start = 0; start < jobs.length; start += 3) {
        const reads = await Promise.allSettled(jobs.slice(start, start + 3).map(async ({ plan, currency, key }) => {
          const id = env[key] || (currency === 'USD' ? env[`PAYPAL_PLAN_${plan.id.toUpperCase()}`] : '')
          if (!id) return { plan: plan.id, currency, state: 'plan_missing' }
          assert.match(id, /^P-[A-Z0-9]+$/, 'Unexpected plan ID; request refused.')
          const response = await read(base + '/v1/billing/plans/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + auth.access_token } })
          const body = await response.json()
          if (!response.ok) return { plan: plan.id, currency, status: response.status, error: errorName(body) }
          return { plan: plan.id, currency, status: response.status, expectedMonthlyAmount: plan.prices[currency],
            validation: validatePayPalBillingPlan(body, { amount: plan.prices[currency], currency }),
            setupFee: body.payment_preferences?.setup_fee ?? null, taxes: body.taxes ?? null,
            cycles: body.billing_cycles?.map(cycle => ({ type: cycle.tenure_type, totalCycles: cycle.total_cycles })) ?? [] }
        }))
        report.paypal.plans.push(...reads.map((item, index) => item.status === 'fulfilled' ? item.value : {
          plan: jobs[start + index].plan.id, currency: jobs[start + index].currency, state: 'read_failed' }))
        save()
      }
    } else report.paypal.state = 'credentials_rejected'
  } catch { report.paypal.state = 'read_failed' }
}
if (!env.RESEND_API_KEY) report.resend = { state: 'credential_missing', senderConfigured: Boolean(env.RESEND_FROM_EMAIL || env.EMAIL_FROM) }
else {
  try {
    const response = await read('https://api.resend.com/domains', { headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY } })
    const body = await response.json()
    const domain = Array.isArray(body.data) ? body.data.find(item => item.name === 'metardu.space') : undefined
    report.resend = { status: response.status, senderConfigured: Boolean(env.RESEND_FROM_EMAIL || env.EMAIL_FROM),
      ...(response.ok ? { domainPresent: Boolean(domain), domainStatus: domain?.status ?? null } : { error: errorName(body) }) }
  } catch { report.resend = { state: 'read_failed' } }
}
save()
console.log(JSON.stringify(report, null, 2))
