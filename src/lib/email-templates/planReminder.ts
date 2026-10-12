import { renderEmailLayout } from './layout'
import { Accent, Heading, Paragraph, PrimaryButton, RichParagraph, Link, escapeHtml } from './components'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://metardu.space'

export interface PlanReminderEmail {
  to: string
  name: string
  unsubscribeUrl: string
}

export const planReminderEmail = {
  subject: 'A plan for your next METARDU survey project',
  render(args: PlanReminderEmail) {
    const pricingUrl = `${APP_URL}/pricing?utm_source=metardu_email&utm_medium=marketing&utm_campaign=plan_reminder`
    const bodyHtml = `
      ${Heading('Ready for your next survey project?')}
      ${RichParagraph(`Hi${args.name ? ` ${escapeHtml(args.name)}` : ''}, METARDU is here when you need more room for your surveying work.`)}
      ${Paragraph(`Your Free access remains available. If a project needs more capacity or tools, compare the current plans and choose the one that fits.`)}
      ${Paragraph(`Keep your project work, field observations, and survey documents together in one workspace. ${Accent('Upgrade only when it makes sense for your work.')}`)}
      ${PrimaryButton(pricingUrl, 'Compare METARDU plans')}
      ${Paragraph(`Questions before choosing? ${Link(`${APP_URL}/help`, 'Visit the Help Centre')}.`, { small: true, muted: true })}
    `
    const rendered = renderEmailLayout(bodyHtml, {
      title: 'METARDU plans for your next survey project',
      preheader: 'Compare plans when you need more capacity for your survey work.',
      unsubscribeUrl: args.unsubscribeUrl,
    })

    return {
      subject: planReminderEmail.subject,
      html: rendered,
      text: [
        `Hi${args.name ? ` ${args.name}` : ''},`,
        '',
        'Your Free access remains available. If a project needs more capacity or tools, compare the current plans and choose the one that fits.',
        'Keep your project work, field observations, and survey documents together in one workspace. Upgrade only when it makes sense for your work.',
        '',
        `Compare METARDU plans: ${pricingUrl}`,
        `Help Centre: ${APP_URL}/help`,
        '',
        `Stop product and plan emails: ${args.unsubscribeUrl}`,
      ].join('\n'),
      headers: {
        'List-Unsubscribe': `<${args.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }
  },
}
