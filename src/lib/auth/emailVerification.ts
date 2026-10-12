import { createHmac, timingSafeEqual } from 'crypto'

interface EmailVerificationPayload {
  sub: string
  email: string
  exp: number
}

function getSigningSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET or NEXTAUTH_SECRET must contain at least 32 characters to sign email verification links.')
  }
  return secret
}

function sign(value: string): Buffer {
  return createHmac('sha256', getSigningSecret()).update(value).digest()
}

/** Create a signed, expiring link token without persisting a bearer token in the database. */
export function createEmailVerificationToken(userId: string, email: string, expiresInSeconds = 48 * 60 * 60): string {
  const payload: EmailVerificationPayload = {
    sub: userId,
    email: email.toLowerCase().trim(),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(encodedPayload).toString('base64url')
  return `${encodedPayload}.${signature}`
}

/** Validate a verification token and return its account binding, or null. */
export function verifyEmailVerificationToken(token: string): EmailVerificationPayload | null {
  if (token.length > 4096) return null
  const [encodedPayload, encodedSignature, extra] = token.split('.')
  if (!encodedPayload || !encodedSignature || extra !== undefined) return null

  try {
    const suppliedSignature = Buffer.from(encodedSignature, 'base64url')
    const expectedSignature = sign(encodedPayload)
    if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) {
      return null
    }

    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<EmailVerificationPayload>
    if (
      typeof parsed.sub !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.sub) ||
      typeof parsed.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.email) ||
      typeof parsed.exp !== 'number' ||
      !Number.isFinite(parsed.exp) ||
      parsed.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null
    }

    return { sub: parsed.sub, email: parsed.email, exp: parsed.exp }
  } catch {
    return null
  }
}
