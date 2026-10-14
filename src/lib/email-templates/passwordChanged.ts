import { renderEmailLayout } from './layout'
import { Heading, Paragraph, PrimaryButton } from './components'
import { getPublicAppUrl } from '@/lib/site'

export interface PasswordChangedEmail {
  to: string
  name: string
}

export const passwordChangedEmail = {
  subject: 'Your METARDU password has changed',
  render(args: PasswordChangedEmail) {
    const recoveryUrl = `${getPublicAppUrl()}/login?recovery=1`
    return {
      subject: passwordChangedEmail.subject,
      html: renderEmailLayout([
        Heading('Your password was changed'),
        Paragraph(args.name ? `Hello ${args.name},` : 'Hello,'),
        Paragraph('Your METARDU password has been updated. Existing sessions have been signed out; sign in with your new password to continue.'),
        Paragraph('If you did not make this change, request a new password reset immediately and contact the METARDU Help Centre.'),
        PrimaryButton(recoveryUrl, 'Recover your account'),
      ].join(''), { preheader: 'Your METARDU password was updated. Review this change.' }),
      text: `Your METARDU password was changed. Existing sessions have been signed out. Sign in with your new password to continue.\n\nIf you did not make this change, recover your account immediately: ${recoveryUrl}\n\nHelp: ${getPublicAppUrl()}/help`,
    }
  },
}
