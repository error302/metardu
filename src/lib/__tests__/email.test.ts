import { resolveDefaultFrom } from '../email'

describe('resolveDefaultFrom', () => {
  it('uses the Resend-specific branded sender ahead of the generic sender', () => {
    expect(resolveDefaultFrom({
      resendFromEmail: 'METARDU <noreply@metardu.space>',
      emailFrom: 'old-sender@example.com',
      smtpUser: 'smtp@example.com',
    })).toBe('METARDU <noreply@metardu.space>')
  })

  it('keeps the generic sender as the fallback when Resend is not configured', () => {
    expect(resolveDefaultFrom({ emailFrom: 'METARDU <noreply@metardu.space>' }))
      .toBe('METARDU <noreply@metardu.space>')
  })

  it('uses the branded METARDU sender when no sender settings are provided', () => {
    expect(resolveDefaultFrom({})).toBe('METARDU <noreply@metardu.space>')
  })
})
