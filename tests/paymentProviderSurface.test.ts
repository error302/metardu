/** @jest-environment node */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  isHistoricalSchemaPath,
  isTestOrSpecFile,
  matchingFiles,
  readSourceFixtures,
  root,
  sourceFiles,
} from './helpers/paymentProviderSurface'

/** Detect the removed provider as a word or identifier segment, not as part of unrelated words. */
function containsRemovedProviderToken(haystack: string): boolean {
  const identifiers = haystack.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []
  return identifiers.some((identifier) => {
    if (identifier.toLowerCase() === 'stripe') return true
    const camelSegments = identifier
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/\s+/)
    return camelSegments.some((segment) => segment.toLowerCase() === 'stripe')
  })
}

interface SourceFixture {
  path: string
  contents: string
}

const renamedCustomerClaimInsertFixture: SourceFixture = {
  path: 'src/app/api/payments/manual-claim/route.ts',
  contents: `
    await db.query(
      \`INSERT INTO payment_history
         (user_id, amount, currency, payment_method, provider, provider_id, status, transaction_id)
       VALUES ($1, $2, 'KES', 'mpesa_till', 'safaricom_buygoods', $3, 'pending_review', $4)\`
    )
  `,
}

const renamedCustomerClaimLookupFixture: SourceFixture = {
  path: 'src/app/api/customer/claim/route.ts',
  contents: "await db.query('SELECT * FROM public.metardu_claimable_till_payment($1)')",
}

const renamedCustomerAcknowledgementFixture: SourceFixture = {
  path: 'src/app/api/payments/claim/route.ts',
  contents: "await sendTemplatedEmail('paymentReviewReceived', { transactionId })",
}

const renamedCustomerModalFixture: SourceFixture = {
  path: 'src/components/billing/ManualCodeDialog.tsx',
  contents: `
    const [mpesaCode, setMpesaCode] = useState('')
    const parsed = parseMpesaSms(pastedSms)
  `,
}

const retiredRouteIdentifierFixture: SourceFixture = {
  path: 'src/app/api/payments/claim/route.ts',
  contents: "await fetch('/api/payments/mpesa/verify-till')",
}

const retiredComponentIdentifierFixture: SourceFixture = {
  path: 'src/components/billing/ManualCodeDialog.tsx',
  contents: "import { MpesaCheckoutModal } from './MpesaCheckoutModal'",
}

const preservedLegacyConsumerFixtures: SourceFixture[] = [
  {
    path: 'src/app/api/payments/mpesa/sms-webhook/route.ts',
    contents: renamedCustomerClaimInsertFixture.contents,
  },
  {
    path: 'src/app/api/admin/payments/till-claims/route.ts',
    contents: renamedCustomerClaimLookupFixture.contents,
  },
  {
    path: 'src/app/admin/payments/page.tsx',
    contents: renamedCustomerModalFixture.contents,
  },
]

const retiredSurfacePaths = new Set([
  'src/app/api/payments/mpesa/verify-till/route.ts',
  'src/components/pricing/MpesaCheckoutModal.tsx',
])

const preservedLegacyConsumerPaths = new Set([
  'src/app/api/payments/mpesa/sms-webhook/route.ts',
  'src/app/api/admin/payments/till-claims/route.ts',
  'src/app/admin/payments/page.tsx',
])

/**
 * The retired manual-till route may be named in exactly one non-customer
 * location: the release promotion script asserts, after every promotion,
 * that the retired route answers 404 on both GET and POST. That is removal
 * proof, not a customer capability, and the script is not part of the
 * application image (the running container has no /app/scripts directory).
 *
 * The allowance is pinned to that single path. Every other active file —
 * including every file under src/ and every other release script — still
 * fails when it names the retired identifier, and the caller re-checks the
 * pinned path's exact contents so the allowance cannot silently widen.
 */
const releaseRemovalProofPaths = new Set([
  'scripts/promote-production-candidate.mjs',
])

function isActiveSourceFixture(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/')
  return !isTestOrSpecFile(normalized)
    && !normalized.split('/').includes('__tests__')
    && !isHistoricalSchemaPath(normalized)
}

function isCustomerPaymentApiRoute(relativePath: string): boolean {
  return /^src\/app\/api\/(?:payments?|customer)\//.test(relativePath)
    && /\/route\.[jt]sx?$/.test(relativePath)
}

function insertsManualTillClaim(contents: string): boolean {
  const inserts = contents.match(
    /INSERT\s+INTO\s+(?:public\.)?payment_history\b[\s\S]*?(?=;|$)/gi,
  ) ?? []

  return inserts.some(statement =>
    /['"]mpesa_till['"]/.test(statement) && /['"]pending_review['"]/.test(statement),
  )
}

function containsManualTillRouteCapability(contents: string): boolean {
  return insertsManualTillClaim(contents)
    || /\bmetardu_claimable_till_payment\s*\(/i.test(contents)
    || /\bpaymentReviewReceived\b/i.test(contents)
}

function isCustomerUiSource(relativePath: string): boolean {
  if (!relativePath.endsWith('.tsx')) return false
  if (relativePath.startsWith('src/app/api/')) return false
  if (relativePath.split('/').includes('admin')) return false
  return relativePath.startsWith('src/components/') || relativePath.startsWith('src/app/')
}

function containsMpesaTransactionCodeInput(contents: string): boolean {
  return /\b(?:mpesa|safaricom)(?:_?transaction)?_?code\b/i.test(contents)
    || /\bset(?:Mpesa|Safaricom)(?:Transaction)?Code\b/i.test(contents)
    || /\bM-?Pesa\s+(?:transaction|receipt)\s+code\b/i.test(contents)
}

function containsManualTillComponentCapability(contents: string): boolean {
  const hasManualTillMarker =
    /\bgetMpesaTillNumber\b|\bparseMpesaSms\b|\bmpesa_till\b|\bpaymentReviewReceived\b/i.test(contents)
    || /fetch\s*\(\s*['"`]\/api\/[^'"`]*(?:till|manual)[^'"`]*['"`]/i.test(contents)

  return containsMpesaTransactionCodeInput(contents) && hasManualTillMarker
}

function containsRetiredManualTillIdentifier(contents: string): boolean {
  return /\bverify-till\b|\bMpesaCheckoutModal\b/.test(contents)
}

function findManualTillSurfaceMatches(files: SourceFixture[]): string[] {
  return files
    .filter(file => {
      const normalized = file.path.replace(/\\/g, '/')
      if (!isActiveSourceFixture(normalized)) return false
      if (retiredSurfacePaths.has(normalized)) return true
      if (
        !releaseRemovalProofPaths.has(normalized)
        && containsRetiredManualTillIdentifier(file.contents)
      ) return true
      if (preservedLegacyConsumerPaths.has(normalized)) return false
      if (isCustomerPaymentApiRoute(normalized)) {
        return containsManualTillRouteCapability(file.contents)
      }
      if (isCustomerUiSource(normalized)) {
        return containsManualTillComponentCapability(file.contents)
      }
      return false
    })
    .map(file => file.path.replace(/\\/g, '/'))
}

describe('payment provider surface', () => {
  it('detects removed-provider identifiers without confusing unrelated words', () => {
    expect(containsRemovedProviderToken('STRIPE_SECRET_KEY')).toBe(true)
    expect(containsRemovedProviderToken('getStripeService()')).toBe(true)
    expect(containsRemovedProviderToken('stripeBreaker')).toBe(true)
    expect(containsRemovedProviderToken('https://api.stripe.com/v1')).toBe(true)
    expect(containsRemovedProviderToken('roadStripEnclosure')).toBe(false)
  })

  it('allows explicitly preserved historical schema locations', () => {
    expect(sourceFiles(path.join('src', 'lib', 'db', 'migrations'))).toEqual([])
    expect(sourceFiles('scripts/init-test-db.sql')).toEqual([])
  })

  it('contains no application or public-facing removed-provider references', () => {
    expect(matchingFiles(containsRemovedProviderToken)).toEqual([])
  })

  it('does not advertise a removed direct-card checkout rail', () => {
    const directCardReference = /\b(?:credit|debit) card\b|\bcard payment\b|\bpay (?:by|with) (?:a )?card\b|\bM-Pesa or card\b|\b(?:M-?Pesa|PayPal)\s*,?\s*card\b|\bcard\s*,?\s*(?:and\s+)?(?:M-?Pesa|PayPal)\b/i
    expect(matchingFiles((contents) => directCardReference.test(contents))).toEqual([])
  })

  it('documents the live subscription payment endpoint with provider-neutral wording', () => {
    const apiDocs = fs.readFileSync(path.join(root, 'src/app/api-docs/page.tsx'), 'utf8')
    expect(apiDocs).toContain("path: '/api/payments'")
    expect(apiDocs).toContain('Start or query a supported subscription payment')
  })

  it('scans the repository when launched from a non-root working directory', () => {
    const helperPath = require.resolve('./helpers/paymentProviderSurface')
    const probe = [
      "const { readSourceFixtures } = require(process.argv[1]);",
      "const fixture = readSourceFixtures().find(file => file.path.replace(/\\\\/g, '/') === 'src/app/api-docs/page.tsx');",
      "process.stdout.write(fixture ? fixture.contents : '');",
    ].join('\n')

    const scannedApiDocs = execFileSync(
      process.execPath,
      ['-e', probe, helperPath],
      {
        cwd: path.join(root, 'src'),
        encoding: 'utf8',
        windowsHide: true,
      },
    )

    expect(scannedApiDocs).toContain("path: '/api/payments'")
  })

  it.each([
    ['inserting a pending manual-till claim', renamedCustomerClaimInsertFixture],
    ['calling the claimable till-payment lookup', renamedCustomerClaimLookupFixture],
    ['submitting the retired claim acknowledgment', renamedCustomerAcknowledgementFixture],
  ])('detects a renamed customer route that recreates the retired claim capability by %s', (_capability, fixture) => {
    expect(findManualTillSurfaceMatches([fixture])).toEqual([fixture.path])
  })

  it('detects a renamed customer modal that recreates the retired manual-code UI capability', () => {
    expect(findManualTillSurfaceMatches([renamedCustomerModalFixture])).toEqual([
      renamedCustomerModalFixture.path,
    ])
  })

  it.each([
    ['route', retiredRouteIdentifierFixture],
    ['component', retiredComponentIdentifierFixture],
  ])('detects the retired %s identifier in active source', (_kind, fixture) => {
    expect(findManualTillSurfaceMatches([fixture])).toEqual([fixture.path])
  })

  for (const fixture of preservedLegacyConsumerFixtures) {
    it(`allows the preserved legacy consumer ${fixture.path}`, () => {
      expect(findManualTillSurfaceMatches([fixture])).toEqual([])
    })
  }

  it('excludes test/spec files and immutable historical migrations from active-source scans', () => {
    expect(
      findManualTillSurfaceMatches([
        { path: 'src/app/api/payments/claim/route.test.ts', contents: 'verify-till' },
        {
          path: 'src/lib/db/migrations/058_payment_history_updated_at.sql',
          contents: '-- The Till claims pipeline (verify-till 2A instant activation)',
        },
      ]),
    ).toEqual([])
  })

  it('contains no active manual-till identifiers or customer surfaces', () => {
    // The retired route may be named in exactly one place: the release
    // promotion script, which after every promotion asserts that the route
    // returns 404 on both GET and POST. That is the removal proof, it is not
    // reachable by a customer, and the script is not part of the application
    // image (the running container has no /app/scripts directory at all).
    //
    // The exception is pinned positively rather than waived: exactly one file
    // may name the retired identifier, and only on the two lines that perform
    // the removal check. Any customer-facing file, any other release script,
    // and any additional occurrence in the promotion script still fails.
    expect([...releaseRemovalProofPaths]).toEqual(['scripts/promote-production-candidate.mjs'])
    for (const allowedPath of releaseRemovalProofPaths) {
      // The allowance must never cover a customer-reachable path.
      expect(allowedPath.startsWith('src/')).toBe(false)
      expect(isCustomerPaymentApiRoute(allowedPath)).toBe(false)
      expect(isCustomerUiSource(allowedPath)).toBe(false)
    }

    const retiredIdentifierMatches = matchingFiles(containsRetiredManualTillIdentifier)
    expect(retiredIdentifierMatches).toEqual(['scripts/promote-production-candidate.mjs'])

    const promotionScript = fs.readFileSync(
      path.join(root, 'scripts', 'promote-production-candidate.mjs'),
      'utf8',
    )
    const promotionScriptRetiredLines = promotionScript
      .split(/\r?\n/)
      .filter(line => /\bverify-till\b/.test(line))
    expect(promotionScriptRetiredLines).toHaveLength(2)
    for (const line of promotionScriptRetiredLines) {
      expect(line).toMatch(/fetchStatus\(/)
      expect(line).toMatch(/\/api\/payments\/mpesa\/verify-till/)
    }

    // The customer-surface scan is unchanged and stays authoritative: it never
    // treats `scripts/` as a customer surface, so the exception above cannot
    // hide a customer-facing capability.
    expect(findManualTillSurfaceMatches(readSourceFixtures())).toEqual([])
  })

  it('does not register the retired manual-till checkout surface', () => {
    const retiredPaths = [
      path.join(root, 'src/app/api/payments/mpesa/verify-till/route.ts'),
      path.join(root, 'src/components/pricing/MpesaCheckoutModal.tsx'),
    ]

    expect(retiredPaths.map(file => fs.existsSync(file))).toEqual([false, false])
  })
})
