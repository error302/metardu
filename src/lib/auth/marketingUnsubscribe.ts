import { createHmac, timingSafeEqual } from 'crypto'

interface MarketingUnsubscribePayload {
  sub: string
  email: string
  v: 1
}

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET or NEXTAUTH_SECRET must contain at least 32 characters to sign marketing preferences links.')
  }
  return secret
}

function sign(value: string): Buffer {
  return createHmac('sha256', signingSecret()).update(value).digest()
}

/** A durable, email-bound token that can only turn marketing mail off. */
export function createMarketingUnsubscribeToken(userId: string, email: string): string {
  const payload: MarketingUnsubscribePayload = {
    sub: userId,
    email: email.toLowerCase().trim(),
    v: 1,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${sign(encoded).toString('base64url')}`
}

/** Validate a signed preference link without disclosing its bound email. */
export function verifyMarketingUnsubscribeToken(token: string): MarketingUnsubscribePayload | null {
  if (token.length > 4096) return null
  const [encoded, signature, extra] = token.split('.')
  if (!encoded || !signature || extra !== undefined) return null

  try {
    const supplied = Buffer.from(signature, 'base64url')
    const expected = sign(encoded)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<MarketingUnsubscribePayload>
    if (
      typeof payload.sub !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub) ||
      typeof payload.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
      payload.email !== payload.email.toLowerCase() ||
      payload.v !== 1
    ) return null

    return { sub: payload.sub, email: payload.email, v: 1 }
  } catch {
    return null
  }
}
