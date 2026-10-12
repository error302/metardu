import { renderEmailLayout } from './layout'
import { Heading, Paragraph, PrimaryButton, escapeHtml } from './components'
import { organizationInviteText, OrganizationInviteTextArgs } from './text'
import { truncate } from './utils'

export interface OrganizationInviteEmail {
  to: string
  organizationName: string
  role: string
  inviteUrl: string
}

export const organizationInviteEmail = {
  subject: (args: OrganizationInviteEmail) =>
    `Invitation to join ${truncate(args.organizationName, 48)} on METARDU`,
  render(args: OrganizationInviteEmail) {
    const bodyHtml = `
      ${Heading('Your team invited you')}
      ${Paragraph(`You have been invited to join ${escapeHtml(args.organizationName)} on METARDU as a ${escapeHtml(args.role)}.`)}
      ${PrimaryButton(args.inviteUrl, 'Review invitation')}
      ${Paragraph('Sign in using the email address this message was sent to, then accept the invitation within 7 days. If you were not expecting this invitation, you can ignore this email.', { small: true, muted: true })}
    `
    const subject = organizationInviteEmail.subject(args)

    return {
      subject,
      html: renderEmailLayout(bodyHtml, {
        title: subject,
        preheader: `You have been invited to join ${truncate(args.organizationName, 48)} on METARDU.`,
      }),
      text: organizationInviteText(args),
    }
  },
}

export type { OrganizationInviteTextArgs }
