/**
 * Plain-text fallback for every email template.
 *
 * Required because some email clients (and accessibility tools) prefer plain
 * text, and many spam filters score messages without a text/plain part lower.
 * The plain text is auto-derived from the same data the HTML uses.
 */

import { formatCurrency, formatDate, formatDateTime } from './utils'

const HELP_URL = `${(process.env.NEXT_PUBLIC_APP_URL || 'https://metardu.space').replace(/\/+$/, '')}/help`

export interface WelcomeTextArgs {
  name: string
  trialEndsAt: string
}
export function welcomeText({ name, trialEndsAt }: WelcomeTextArgs): string {
  return `Welcome to METARDU${name ? `, ${name}` : ''}!

Your 14-day Pro trial is now active — it ends on ${formatDate(trialEndsAt)}.

With Pro you can:
  - Create unlimited survey projects
  - Run Bowditch and least-squares traverse adjustments
  - Generate deed plans, Form No. 4, and statutory workbooks
  - Export to DXF, GeoJSON, Shapefile
  - Use GPS stakeout in the field
  - Connect to RTK GNSS receivers via Bluetooth

Get started:
  ${process.env.NEXT_PUBLIC_APP_URL || 'https://metardu.space'}/dashboard

Questions? Visit the METARDU Help Centre: ${HELP_URL}

— METARDU
`
}

export interface TrialEndingTextArgs {
  name: string
  trialEndsAt: string
  planPriceNote: string
}
export function trialEndingText({ name, trialEndsAt, planPriceNote }: TrialEndingTextArgs): string {
  return `Hi${name ? ` ${name}` : ''} — your METARDU Pro trial ends on ${formatDate(trialEndsAt)}.

After the trial you'll move to the Free plan (1 project, 50 survey points, basic PDF reports).

Keep your Pro features (${planPriceNote}):
  ${process.env.NEXT_PUBLIC_APP_URL || 'https://metardu.space'}/pricing

Questions? Visit the METARDU Help Centre: ${HELP_URL}

— METARDU
`
}

export interface TrialExpiringTextArgs {
  name: string
  trialEndsAt: string
  planPriceNote: string
}
export function trialExpiringText({ name, trialEndsAt, planPriceNote }: TrialExpiringTextArgs): string {
  return `Hi${name ? ` ${name}` : ''} — your METARDU Pro trial ends in under 24 hours (on ${formatDate(trialEndsAt)}).

After that you'll move to the Free plan automatically. Your projects, observations, and documents stay safe.

Keep Pro (${planPriceNote}):
  ${process.env.NEXT_PUBLIC_APP_URL || 'https://metardu.space'}/pricing

— METARDU
`
}

export interface PasswordResetTextArgs {
  name: string
  resetUrl: string
  expiresAt: string
}
export function passwordResetText({ name, resetUrl, expiresAt }: PasswordResetTextArgs): string {
  return `Hi${name ? ` ${name}` : ''},

We received a request to reset your METARDU password. Open this link to choose a new password:

${resetUrl}

This link expires on ${formatDate(expiresAt)}.

If you didn't request this reset, you can safely ignore this email — your password is still secure.

— METARDU
`
}

export interface PaymentReceiptTextArgs {
  name: string
  planName: string
  amount: number
  currency: string
  paidAt: string
  receiptUrl?: string
}
export function paymentReceiptText(args: PaymentReceiptTextArgs): string {
  const lines = [
    `Hi${args.name ? ` ${args.name}` : ''},`,
    '',
    `Thanks for your payment — your ${args.planName} subscription is now active.`,
    '',
    `Amount paid: ${formatCurrency(args.amount, args.currency)}`,
    `Date: ${formatDate(args.paidAt)}`,
  ]
  if (args.receiptUrl) {
    lines.push('', `View receipt: ${args.receiptUrl}`)
  }
  lines.push(
    '',
    'You can manage your subscription from your account settings:',
    `  ${process.env.NEXT_PUBLIC_APP_URL || 'https://metardu.space'}/settings/profile`,
    '',
    '— METARDU',
  )
  return lines.join('\n')
}

export interface PaymentFailedTextArgs {
  name: string
  planName: string
  amount: number
  currency: string
  failureReason: string
  retryUrl: string
}
export function paymentFailedText(args: PaymentFailedTextArgs): string {
  return `Hi${args.name ? ` ${args.name}` : ''},

We couldn't process your payment for the ${args.planName} plan.

Amount: ${formatCurrency(args.amount, args.currency)}
Reason: ${args.failureReason}

Your projects, observations, and documents stay in your account. Paid feature access follows your subscription status and current billing period; an unresolved payment may interrupt access. Update your payment method or choose another payment option:

${args.retryUrl}

If this was a one-off issue, try again. For help with payment options, visit the METARDU Help Centre: ${HELP_URL}

— METARDU
`
}

export interface SecurityAlertTextArgs {
  name: string
  eventName: string
  deviceInfo: string
  location: string
  timestamp: string
  reviewUrl: string
}
export function securityAlertText(args: SecurityAlertTextArgs): string {
  return `Hi${args.name ? ` ${args.name}` : ''},

We detected ${args.eventName} on your METARDU account.

  When: ${formatDate(args.timestamp)}
  Device: ${args.deviceInfo}
  Location: ${args.location}

If this was you, no action is needed. If not, please review your account activity and change your password:

${args.reviewUrl}

— METARDU Security
`
}

export interface ProjectSharedTextArgs {
  recipientName: string
  sharerName: string
  projectName: string
  role: string
  projectUrl: string
}
export function projectSharedText(args: ProjectSharedTextArgs): string {
  return `Hi${args.recipientName ? ` ${args.recipientName}` : ''},

${args.sharerName} shared the project "${args.projectName}" with you as ${args.role}.

Open the project:
${args.projectUrl}

You'll be able to view and contribute based on your role. For help, visit the METARDU Help Centre: ${HELP_URL}

— METARDU
`
}

export interface WeeklyDigestTextArgs {
  name: string
  weekStart: string
  weekEnd: string
  projectsActive: number
  projectsCompleted: number
  pointsCollected: number
  documentsGenerated: number
  pendingSubmissions: number
  dashboardUrl: string
}
export function weeklyDigestText(args: WeeklyDigestTextArgs): string {
  return `Hi${args.name ? ` ${args.name}` : ''},

Here's your METARDU activity for ${formatDate(args.weekStart)} — ${formatDate(args.weekEnd)}:

  Active projects: ${args.projectsActive}
  Completed: ${args.projectsCompleted}
  Survey points collected: ${args.pointsCollected}
  Documents generated: ${args.documentsGenerated}
  Pending submissions: ${args.pendingSubmissions}

Open your dashboard:
${args.dashboardUrl}

— METARDU
`
}

export interface OrganizationInviteTextArgs {
  to: string
  organizationName: string
  role: string
  inviteUrl: string
}
export function organizationInviteText(args: OrganizationInviteTextArgs): string {
  return `You have been invited to join ${args.organizationName} on METARDU as a ${args.role}.

Sign in using ${args.to} and accept the invitation within 7 days:
${args.inviteUrl}

If you were not expecting this invitation, you can ignore this email.

— METARDU
`
}

export interface PaymentReviewReceivedTextArgs {
  to: string
  name: string
  planName: string
  amount: number
  seatCount: number
  transactionId: string
  tillNumber: string
  submittedAt: string
}
export function paymentReviewReceivedText(args: PaymentReviewReceivedTextArgs): string {
  return `Hi${args.name ? ` ${args.name}` : ''},

We received your M-Pesa payment claim for the ${args.planName} plan.

Seats: ${args.seatCount}
Amount: ${formatCurrency(args.amount, 'KES')}
M-Pesa code: ${args.transactionId}
Till number: ${args.tillNumber}
Submitted: ${formatDateTime(args.submittedAt)}

Our team checks the payment against the merchant statement. Your plan activates after the payment is confirmed, usually within a few hours. Please do not submit the same payment again.

If the payment is not confirmed within 24 hours, contact the METARDU Help Centre and include the M-Pesa confirmation details: ${HELP_URL}

— METARDU
`
}
