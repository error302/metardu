import { createHash } from 'node:crypto'

/** Store a digest, not a bearer credential, in password_reset_tokens.token. */
export function hashPasswordResetToken(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`
}
