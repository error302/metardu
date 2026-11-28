/**
 * Provider failures must be diagnosable without leaking credentials.
 *
 * The structured logger serialises an Error as `{}`, which is why the real
 * M-Pesa transport error was previously unrecoverable from production logs.
 * These tests pin the safe summary that replaces it.
 */
import { providerFailureDetails } from '@/lib/payments/mpesa'

describe('providerFailureDetails', () => {
  it('captures standard transport error diagnostics from an Error', () => {
    const cause = Object.assign(new Error('fetch failed'), {
      code: 'ECONNRESET',
      errno: -104,
      syscall: 'read',
      address: '64:ff9b::c4c9:d6ca',
      port: 443,
    })

    expect(providerFailureDetails(cause)).toEqual({
      kind: 'Error',
      name: 'Error',
      message: 'fetch failed',
      code: 'ECONNRESET',
      errno: -104,
      syscall: 'read',
      address: '64:ff9b::c4c9:d6ca',
      port: 443,
    })
  })

  it('never copies secret-shaped properties out of a nested cause', () => {
    const cause = Object.assign(new Error('upstream failed'), {
      authorization: 'Bearer SECRET_VALUE',
      access_token: 'SECRET_TOKEN',
    })
    const details = providerFailureDetails(cause)

    expect(JSON.stringify(details)).not.toContain('SECRET_VALUE')
    expect(JSON.stringify(details)).not.toContain('SECRET_TOKEN')
    expect(Object.keys(details).sort()).toEqual([
      'address', 'code', 'errno', 'kind', 'message', 'name', 'port', 'syscall',
    ])
  })

  it('truncates long provider messages', () => {
    const details = providerFailureDetails(new Error('x'.repeat(1000)))
    expect((details.message as string).length).toBe(300)
  })

  it('reports only key names for plain objects and the type for primitives', () => {
    expect(providerFailureDetails({ consumerSecret: 'SECRET', code: 'EAI_AGAIN' })).toEqual({
      kind: 'object',
      keys: ['code', 'consumerSecret'],
    })
    expect(providerFailureDetails('boom')).toEqual({ kind: 'string' })
    expect(providerFailureDetails(null)).toEqual({ kind: 'object' })
  })
})
