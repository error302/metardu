import { renderEmailLayout } from './layout'
import { Heading, Paragraph, PrimaryButton } from './components'

export interface EmailVerification {
  to: string
  name: string
  verifyUrl: string
}

export const emailVerificationEmail = {
  subject: 'Verify your METARDU email address',
  render(args: EmailVerification) {
    const greeting = args.name ? `Hello ${args.name},` : 'Hello,'
    const bodyHtml = `
      ${Heading('Confirm your email address')}
      ${Paragraph(greeting)}
      ${Paragraph('Confirm this address to secure your METARDU account and receive project, subscription, and payment updates.')}
      ${PrimaryButton(args.verifyUrl, 'Verify email address')}
      ${Paragraph('This link expires in 48 hours. If you did not create a METARDU account, you can ignore this message.', { small: true, muted: true })}
    `

    return {
      subject: emailVerificationEmail.subject,
      html: renderEmailLayout(bodyHtml, { preheader: 'Confirm the email address for your METARDU account.' }),
      text: `${greeting}\n\nConfirm your METARDU email address to secure your account and receive project, subscription, and payment updates.\n\nVerify your email: ${args.verifyUrl}\n\nThis link expires in 48 hours. If you did not create a METARDU account, ignore this message.`,
    }
  },
}
