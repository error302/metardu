import { renderEmailLayout } from './layout'
import { CalloutBox, Heading, Paragraph, RichParagraph, StatRow, StatTable, Link } from './components'
import { paymentReviewReceivedText, PaymentReviewReceivedTextArgs } from './text'
import { formatCurrency, formatDateTime } from './utils'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://metardu.space'

export interface PaymentReviewReceivedEmail {
  to: string
  name: string
  planName: string
  amount: number
  seatCount: number
  transactionId: string
  tillNumber: string
  submittedAt: string
}

export const paymentReviewReceivedEmail = {
  subject: 'M-Pesa payment received for review',
  render(args: PaymentReviewReceivedEmail) {
    const bodyHtml = `
      ${Heading('Your payment is being reviewed')}
      ${Paragraph(`Hi${args.name ? ` ${args.name}` : ''}, we received your M-Pesa payment claim for the ${args.planName} plan.`)}
      ${StatTable(
        StatRow('Plan', args.planName) +
        StatRow('Seats', String(args.seatCount)) +
        StatRow('Amount', formatCurrency(args.amount, 'KES')) +
        StatRow('M-Pesa code', args.transactionId) +
        StatRow('Till number', args.tillNumber) +
        StatRow('Submitted', formatDateTime(args.submittedAt)),
      )}
      ${CalloutBox(
        'What happens next',
        'Our team checks the payment against the merchant statement. Your plan activates after the payment is confirmed, usually within a few hours. Please do not submit the same payment again.',
        { tone: 'info' },
      )}
      ${RichParagraph(`If the payment is not confirmed within 24 hours, contact the ${Link(`${APP_URL}/help`, 'METARDU Help Centre')} and include the M-Pesa confirmation details.`, { small: true, muted: true })}
    `

    return {
      subject: paymentReviewReceivedEmail.subject,
      html: renderEmailLayout(bodyHtml, {
        title: paymentReviewReceivedEmail.subject,
        preheader: `We received your M-Pesa claim for the ${args.planName} plan. It is being checked against the merchant statement.`,
      }),
      text: paymentReviewReceivedText(args),
    }
  },
}

export type { PaymentReviewReceivedTextArgs }
