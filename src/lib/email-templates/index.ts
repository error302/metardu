/**
 * Central registry of all transactional email templates.
 *
 * Adding a new email:
 *   1. Create src/lib/email-templates/<name>.ts exporting an object with:
 *        { subject: string | ((args) => string), render: (args) => { subject, html, text } }
 *   2. Add it to the EMAIL_TEMPLATES registry below.
 *   3. Import `sendTemplatedEmail` from this file and call from your API route.
 *
 * Never inline HTML in a route handler — always go through this registry.
 */

import { sendEmail } from '@/lib/email'
import { welcomeEmail, WelcomeEmail } from './welcome'
import { trialEndingEmail, TrialEndingEmail } from './trialEnding'
import { trialExpiringEmail, TrialExpiringEmail } from './trialExpiring'
import { passwordResetEmail, PasswordResetEmail } from './passwordReset'
import { passwordChangedEmail, PasswordChangedEmail } from './passwordChanged'
import { paymentReceiptEmail, PaymentReceiptEmail } from './paymentReceipt'
import { paymentFailedEmail, PaymentFailedEmail } from './paymentFailed'
import { securityAlertEmail, SecurityAlertEmail } from './securityAlert'
import { projectSharedEmail, ProjectSharedEmail } from './projectShared'
import { weeklyDigestEmail, WeeklyDigestEmail } from './weeklyDigest'
import { emailVerificationEmail, EmailVerification } from './emailVerification'
import { organizationInviteEmail, OrganizationInviteEmail } from './organizationInvite'
import { paymentReviewReceivedEmail, PaymentReviewReceivedEmail } from './paymentReviewReceived'
import { planReminderEmail, PlanReminderEmail } from './planReminder'

// Re-export every template and its Args type for ergonomic imports
export {
  welcomeEmail,
  trialEndingEmail,
  trialExpiringEmail,
  passwordResetEmail,
  passwordChangedEmail,
  paymentReceiptEmail,
  paymentFailedEmail,
  securityAlertEmail,
  projectSharedEmail,
  weeklyDigestEmail,
  emailVerificationEmail,
  organizationInviteEmail,
  paymentReviewReceivedEmail,
  planReminderEmail,
}

export type {
  WelcomeEmail,
  TrialEndingEmail,
  TrialExpiringEmail,
  PasswordResetEmail,
  PasswordChangedEmail,
  PaymentReceiptEmail,
  PaymentFailedEmail,
  SecurityAlertEmail,
  ProjectSharedEmail,
  WeeklyDigestEmail,
  EmailVerification,
  OrganizationInviteEmail,
  PaymentReviewReceivedEmail,
  PlanReminderEmail,
}

export type EmailTemplateName =
  | 'welcome'
  | 'trialEnding'
  | 'trialExpiring'
  | 'passwordReset'
  | 'passwordChanged'
  | 'paymentReceipt'
  | 'paymentFailed'
  | 'securityAlert'
  | 'projectShared'
  | 'weeklyDigest'
  | 'emailVerification'
  | 'organizationInvite'
  | 'paymentReviewReceived'
  | 'planReminder'

interface TemplateSpec<TArgs> {
  subject: string | ((args: TArgs) => string)
  render: (args: TArgs) => { subject: string; html: string; text: string; headers?: Record<string, string> }
}

// Each template is registered with its concrete args type.
interface TemplateMap {
  welcome: TemplateSpec<WelcomeEmail>
  trialEnding: TemplateSpec<TrialEndingEmail>
  trialExpiring: TemplateSpec<TrialExpiringEmail>
  passwordReset: TemplateSpec<PasswordResetEmail>
  passwordChanged: TemplateSpec<PasswordChangedEmail>
  paymentReceipt: TemplateSpec<PaymentReceiptEmail>
  paymentFailed: TemplateSpec<PaymentFailedEmail>
  securityAlert: TemplateSpec<SecurityAlertEmail>
  projectShared: TemplateSpec<ProjectSharedEmail>
  weeklyDigest: TemplateSpec<WeeklyDigestEmail>
  emailVerification: TemplateSpec<EmailVerification>
  organizationInvite: TemplateSpec<OrganizationInviteEmail>
  paymentReviewReceived: TemplateSpec<PaymentReviewReceivedEmail>
  planReminder: TemplateSpec<PlanReminderEmail>
}

export const EMAIL_TEMPLATES: TemplateMap = {
  welcome: welcomeEmail,
  trialEnding: trialEndingEmail,
  trialExpiring: trialExpiringEmail,
  passwordReset: passwordResetEmail,
  passwordChanged: passwordChangedEmail,
  paymentReceipt: paymentReceiptEmail,
  paymentFailed: paymentFailedEmail,
  securityAlert: securityAlertEmail,
  projectShared: projectSharedEmail,
  weeklyDigest: weeklyDigestEmail,
  emailVerification: emailVerificationEmail,
  organizationInvite: organizationInviteEmail,
  paymentReviewReceived: paymentReviewReceivedEmail,
  planReminder: planReminderEmail,
}

/**
 * High-level helper: send a templated email by name.
 *
 * @example
 *   await sendTemplatedEmail('welcome', { to, name, trialEndsAt })
 */
export async function sendTemplatedEmail<TName extends EmailTemplateName>(
  name: TName,
  args: TemplateMap[TName]['render'] extends (a: infer A) => unknown ? A & { to: string } : never,
  options: { idempotencyKey?: string } = {},
): Promise<{ success: boolean; error?: string }> {
  const template = EMAIL_TEMPLATES[name] as TemplateSpec<{ to: string }>
  if (!template) {
    return { success: false, error: `Unknown email template: ${name}` }
  }

  const rendered = template.render(args)
  const subject = typeof template.subject === 'function'
    ? (template.subject as (a: typeof args) => string)(args)
    : template.subject

  const result = await sendEmail({
    to: args.to,
    subject,
    html: rendered.html,
    text: rendered.text,
    headers: rendered.headers,
    idempotencyKey: options.idempotencyKey,
  })

  if (!result.success) {
    return { success: false, error: typeof result.error === 'string' ? result.error : 'Send failed' }
  }
  return { success: true }
}
