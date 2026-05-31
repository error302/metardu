import Link from 'next/link'

const sections = [
  {
    title: '1. Overview',
    body: `This Refund Policy describes the circumstances under which METARDU ("we", "us", or "our") will issue refunds for subscription payments, one-time purchases, and service fees. This policy applies to all payment methods we accept, including Stripe (credit/debit cards), PayPal, and M-Pesa (Safaricom Daraja API). By making a payment on the Platform, you agree to the terms of this Refund Policy. This policy should be read alongside our Terms of Service at /docs/terms.`,
  },
  {
    title: '2. Subscription Refunds',
    body: `Subscriptions are billed in advance on a recurring basis (monthly or annually, depending on your plan). The following refund rules apply: (a) New subscriptions — If you are dissatisfied with the Platform within the first 14 calendar days of a new subscription, you may request a full refund by contacting billing@metardu.app. The refund will be processed to your original payment method within 5-10 business days for Stripe and PayPal, or within 7-14 business days for M-Pesa. (b) Annual subscriptions — If you cancel an annual subscription within the first 30 calendar days, you are eligible for a prorated refund for the unused portion of the subscription period. After 30 days, annual subscriptions are non-refundable but will remain active until the end of the paid period. (c) Monthly subscriptions — Monthly subscriptions may be cancelled at any time. You will retain access until the end of the current billing period. No refund is issued for the remaining days in the current month, except as provided in Section 3 below. (d) Renewal charges — If your subscription auto-renews and you did not intend to renew, you may request a refund within 7 calendar days of the renewal charge. We will process a full refund and cancel the subscription.`,
  },
  {
    title: '3. Service Failure Refunds',
    body: `If the Platform experiences a significant service outage that prevents you from using core features (survey computation, document generation, or project access) for more than 24 consecutive hours, you may request: (a) A credit equal to the prorated subscription fee for the affected period, applied to your next billing cycle; or (b) A prorated refund for the affected period to your original payment method. To request a service failure refund, contact billing@metardu.app with your account email, the date(s) of the outage, and the features affected. We will verify the outage against our monitoring data and process eligible refunds within 5-10 business days. This section does not apply to scheduled maintenance of which you received at least 48 hours advance notice, or to outages caused by third-party services beyond our control.`,
  },
  {
    title: '4. Payment Errors',
    body: `If you are charged incorrectly — including duplicate charges, charges for a plan you did not subscribe to, or charges after you cancelled your subscription — you are entitled to a full refund of the incorrect charge. Please contact billing@metardu.app immediately upon discovering the error. We will investigate and process refunds for confirmed payment errors within 3-5 business days for Stripe and PayPal, or 7-14 business days for M-Pesa. If you notice an unauthorized charge on your M-Pesa statement, you should also contact Safaricom directly through their customer service channels.`,
  },
  {
    title: '5. M-Pesa Specific Terms',
    body: `For payments made via M-Pesa (Safaricom Daraja API): (a) Refunds are processed back to the M-Pesa phone number used for the original payment. (b) M-Pesa refunds may take 7-14 business days to appear in your M-Pesa account due to Safaricom's processing timeline. (c) If the M-Pesa phone number is no longer active or reachable, we will work with you to arrange an alternative refund method. (d) M-Pesa transaction fees (if any) are non-refundable as these are charged by Safaricom, not by METARDU. (e) STK Push transactions that fail before completion (e.g., due to insufficient balance, PIN entry timeout, or network error) are not charged and do not require a refund.`,
  },
  {
    title: '6. PayPal Specific Terms',
    body: `For payments made via PayPal: (a) Refunds are processed to your PayPal account. (b) PayPal refunds are typically processed within 5-10 business days. (c) PayPal's own refund policies and processing timelines apply in addition to this policy. (d) If a PayPal dispute is opened, we will work with PayPal's resolution process and may issue a refund through PayPal's dispute mechanism rather than directly. (e) Currency conversion fees charged by PayPal are non-refundable.`,
  },
  {
    title: '7. Stripe Specific Terms',
    body: `For payments made via Stripe (credit/debit cards): (a) Refunds are processed to the original payment card. (b) Stripe refunds typically appear on your statement within 5-10 business days, depending on your card issuer's processing timeline. (c) If your card has expired or been cancelled, we will work with you and your card issuer to arrange an alternative refund method. (d) Chargebacks initiated through your card issuer are subject to the card network's dispute resolution process and may take up to 60 days to resolve. We encourage you to contact us at billing@metardu.app before initiating a chargeback, as we can often resolve the issue more quickly.`,
  },
  {
    title: '8. Non-Refundable Items',
    body: `The following are not eligible for refund: (a) Usage-based charges for features that were accessed and used, even if the results were not as expected, as the Platform is a computation tool subject to the professional verification requirements described in our Terms of Service. (b) Subscription charges for periods during which the Platform was available and functional, beyond the refund windows described in Section 2. (c) Charges resulting from your failure to cancel a subscription before the renewal date, except as provided in Section 2(d). (d) Transaction fees charged by payment processors (Stripe, PayPal, M-Pesa). (e) Charges for accounts terminated due to violations of our Terms of Service. (f) Discounts, promotional credits, or free trial periods that were not paid for.`,
  },
  {
    title: '9. How to Request a Refund',
    body: `To request a refund, send an email to billing@metardu.app with the following information: (a) Your registered account email address. (b) The date and amount of the charge. (c) The payment method used (Stripe, PayPal, or M-Pesa). (d) The reason for the refund request. (e) Any supporting documentation (screenshots, error messages, transaction references). We will acknowledge receipt of your refund request within 2 business days and provide a decision within 5 business days. If your refund is approved, we will process it within the timeframes described in the relevant payment method section above. If your refund request is denied, we will explain the reason and may offer an alternative resolution such as account credit or subscription extension.`,
  },
  {
    title: '10. Cancellation Process',
    body: `To cancel your subscription: (a) Navigate to Account > Billing in the Platform and click "Cancel Subscription"; or (b) Email billing@metardu.app with your account email and a request to cancel. Upon cancellation: (i) Your subscription will remain active until the end of the current paid billing period. (ii) You will retain access to all paid features until the subscription expires. (iii) Your project data will be preserved for 90 days after expiration in case you wish to resubscribe. (iv) After 90 days, your account may be converted to a free tier and project data subject to free tier storage limits. (v) No further charges will be applied after cancellation. We do not offer partial-month refunds for monthly subscriptions cancelled mid-period, except as provided in Sections 3 and 4.`,
  },
  {
    title: '11. Disputes',
    body: `If you disagree with a refund decision, you may: (a) Request a review by a senior member of our billing team by emailing billing@metardu.app with "REFUND REVIEW REQUEST" in the subject line. (b) Pursue the dispute resolution process described in Section 16 of our Terms of Service, including mediation and arbitration through the Nairobi Centre for International Arbitration (NCIA). We are committed to fair and transparent handling of all refund requests and will make reasonable efforts to resolve disputes amicably.`,
  },
  {
    title: '12. Changes to This Policy',
    body: `We may update this Refund Policy from time to time. Material changes that reduce your refund rights will take effect only at the start of your next billing period, with at least 30 days' prior notice. Changes that expand your refund rights take effect immediately. We will notify you of material changes by email or Platform notification.`,
  },
  {
    title: '13. Contact',
    body: `For refund requests, cancellation inquiries, or billing questions, contact billing@metardu.app. For general support, contact support@metardu.app. For data protection inquiries related to payment data, contact dpo@metardu.app.`,
  },
]

export default function RefundPage() {
  return (
    <div className="min-h-screen py-16">
      <div className="mx-auto max-w-4xl px-6">
        <Link href="/docs" className="mb-8 inline-block text-[var(--accent)] hover:underline">
          Back to Documentation
        </Link>

        <p className="mb-3 text-sm uppercase tracking-[0.2em] text-[var(--text-muted)]">Legal</p>
        <h1 className="mb-4 text-4xl font-bold text-[var(--text-primary)]">Refund Policy</h1>
        <p className="mb-10 text-[var(--text-secondary)]">Effective date: May 22, 2026</p>

        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
              <h2 className="mb-3 text-xl font-semibold text-[var(--text-primary)]">{section.title}</h2>
              <p className="leading-7 text-[var(--text-secondary)]">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
          <h2 className="mb-3 text-xl font-semibold text-[var(--text-primary)]">Related Policies</h2>
          <ul className="space-y-2 text-[var(--text-secondary)]">
            <li><Link href="/docs/terms" className="text-[var(--accent)] hover:underline">Terms of Service</Link></li>
            <li><Link href="/docs/privacy" className="text-[var(--accent)] hover:underline">Privacy Policy</Link></li>
            <li><Link href="/docs/data-protection" className="text-[var(--accent)] hover:underline">Data Protection Policy</Link></li>
            <li><Link href="/docs/cookies" className="text-[var(--accent)] hover:underline">Cookie Policy</Link></li>
          </ul>
        </div>
      </div>
    </div>
  )
}
