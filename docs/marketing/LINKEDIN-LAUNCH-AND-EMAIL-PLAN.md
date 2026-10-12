# METARDU LinkedIn launch and email plan

Status: prepared campaign draft; no ad spend, customer export, or marketing batch has been launched.

## Offer and billing checks

The supplied Campaign Manager screenshot shows a personalized offer of **$250 in LinkedIn ad spend for $250 in ad credit** and says the advertiser must be a Page admin. It shows the ad account currency as USD. Before spending, open **Billing → Credits and promotions** in that same account and record its qualify-by date, eligible spend, credit expiry, and status. LinkedIn says a qualifying Spend X, Get Y credit is normally applied within five business days after the spend requirement is met; the offer dates are account-specific. Credits do not stop a campaign automatically when exhausted, and LinkedIn's promotion terms say charges can exceed a set budget by up to 20%. Treat $250 of spend as potentially up to $300 billed exposure until the exact account terms and billing controls are reviewed.

### Current account check (2026-10-13)

- LinkedIn exposes one ad account named `METAARDU`. It is marked active, but its serving status is **Billing Hold**. The signed-in Company Page Admin view is also named `METAARDU`, so the account and Page match each other; both spellings differ from the product's public `METARDU` name by an extra “A”. Confirm that this is intentional before advertising.
- Campaign Manager currently has an open new-campaign setup for **Brand awareness**. Its displayed setup uses Kenya, audience expansion on, LinkedIn Audience Network on, and a **$200 daily budget with no end date**. The estimate is 7.9 million-plus members and $3,000–$6,000 over 30 days. Do not launch this setup; it is far above the offer's qualifying spend.
- The billing hold means ads will not run until the account's billing admin resolves it. LinkedIn says billing holds commonly result from a billing issue or missing payment method; for a declined charge, the billing admin should retry with an updated payment method and contact the financial institution if declines continue. No payment details were changed.
- The offer's exact qualify-by date, expiry date, and progress remain unverified. LinkedIn says to check **Billing → Credits and promotions** in Campaign Manager. Do not spend until those dates and the possible $300 exposure are accepted.

Do not launch until the identity spelling is confirmed, the billing hold is cleared by the account owner, the exact offer dates are recorded, and the campaign owner accepts the possible overrun.

## First campaign draft

Use one **Lead generation** campaign with a LinkedIn Lead Gen Form. The form keeps the first visit inside LinkedIn and avoids adding an Insight Tag to account, payment, or project pages. LinkedIn requires a privacy-policy URL for the form and recommends keeping forms to three or four fields.

Audience to test: Kenya; professional roles or skills around land surveying, geomatics, civil engineering, GIS, and road or infrastructure delivery. Start with the smallest audience Campaign Manager permits without becoming too broad. Exclude METARDU staff and current paid customers if a reliable, consented suppression audience is available. Do not upload partner or customer emails as a matched audience without a documented lawful basis and notice.

**Primary ad**

- Introductory text: “Road survey work spans planning, field observations, checks, and deliverables. METARDU brings survey project work into one workspace so your team can review the workflow before the next corridor job. Request a walkthrough and tell us what your field team needs.”
- Headline: “A clearer workflow for road survey teams”
- CTA: “Request demo”
- Form fields: name, work email, company, and role.
- Form details: “Request a METARDU walkthrough for your road or infrastructure survey workflow. We’ll use these details to respond to your request. Product news and offers are a separate, optional choice.”
- Privacy policy: `https://metardu.space/docs/privacy`
- Confirmation: “Thanks. METARDU will follow up about your walkthrough request.” Link to `https://metardu.space/demo` only after confirming that route is live and the booking experience works.

**Creative test:** make a second single-image version using a real, permission-cleared METARDU workflow screenshot. Keep the same audience, form, and CTA so the creative is the variable. Use no client names, parcel identifiers, coordinates, field photographs, or customer project data.

Use UTM values on any website link: `utm_source=linkedin&utm_medium=paid_social&utm_campaign=ke_road_survey_launch&utm_content=workflow_a` and `workflow_b`. Review form opens, submitted leads, qualified survey teams, walkthroughs booked, and paid conversions weekly. Pause a creative for review if it spends $50 without a qualified lead; stop the campaign when the confirmed eligible-spend target is reached and verify the credit in Billing.

## Existing-user email plan

METARDU already sends separate trial lifecycle reminders three days and 24 hours before expiry. This change adds one monthly plan reminder for existing Free accounts only. It requires all of the following: verified account email, the user’s explicit “Product news & offers” opt-in, a matching active marketing-consent record, at least seven days since signup, and no active paid plan, trial, or past-due subscription. It skips anyone mailed in the prior 30 days and includes a direct unsubscribe link plus one-click unsubscribe headers.

The connected Resend workspace currently has a single `General` segment, which is not treated as proof of marketing consent or used as the target list. METARDU’s app consent ledger is the source for the campaign audience. An email attempt that remains ambiguous for more than 23 hours is held for review and suppresses further plan mail until resolved.

The new email is intentionally useful and low pressure: it says Free access remains available, links to current plans, and gives a clear way to stop product and plan email. The scheduler checks consent again immediately before each send, so a recently upgraded or unsubscribed account is skipped. Each account receives at most one plan reminder per 30 days. Weekly project digests remain a separate preference. Trial reminders remain service lifecycle messages and are not used as permission to send other promotions.

The sending route and monthly workflow stay disabled unless both the app setting `METARDU_MARKETING_EMAILS_ENABLED=true` and GitHub repository variable of the same name are explicitly enabled. The production container must also have Resend configured. Review the final audience count and copy before enabling those controls. A LinkedIn lead’s request for a demo is not consent to recurring promotional email; collect that separately.

### Current email checks (2026-10-13)

- Resend reports `metardu.space` as verified with sending enabled. One branded delivery test from `noreply@metardu.space` to the owner inbox was confirmed **delivered**; it used an inline copy of the tracked METARDU email mark. No customer list or marketing broadcast was sent.
- The live `/pricing`, `/docs/privacy`, `/demo`, and `/help` routes return HTTP 200. `/privacy` returns 404; the automated email footer now links to `/docs/privacy`, with a test asserting that route.
- The tracked `/metardu-email-mark.png` asset currently returns 404 on production. The running app also lacks the Resend API key, sender address, and marketing enable flag; migration `105_marketing_email_deliveries.sql` has not been applied. Therefore the new in-app reminders and hosted-logo path are not live yet, and the email workflow remains disabled.

## Measurement and privacy

Start with LinkedIn’s native Lead Gen Form and a human-reviewed follow-up. Do not install the LinkedIn Insight Tag on sign-in, account, project, or payment pages; LinkedIn warns against placing it on pages that collect or contain sensitive data. If website conversion tracking is added later, restrict it to a reviewed public page and generic conversion event.

Kenya’s Data Protection (General) Regulations describe direct-marketing opt-out requirements, including a simplified opt-out mechanism and instructions in each message. METARDU’s campaign therefore gates on its separate marketing-consent record and makes unsubscribe available in the email itself. Have the privacy notice and lead-form language reviewed against the current legal requirements before launch.

## Verified references

- [LinkedIn Spend X, Get Y promotion](https://www.linkedin.com/help/billing/answer/a425371): account-specific qualification and expiry dates, with credits generally applied within five business days after qualifying spend.
- [LinkedIn advertising coupon terms](https://www.linkedin.com/legal/ad-coupon-terms): advertiser responsibility for charges; campaign budget and end-date controls; possible budget overrun.
- [LinkedIn Lead Gen Forms](https://www.linkedin.com/help/lms/answer/a427102/create-lead-gen-forms?lang=en): privacy-policy URL requirement and form setup.
- [LinkedIn Lead Gen Form best practices](https://www.linkedin.com/help/lms/answer/a421181/): recommends three to four fields.
- [LinkedIn conversion tracking guidance](https://www.linkedin.com/help/lms/answer/a425606/set-up-online-conversion-tracking?lang=en): Insight Tag restrictions for pages that collect or contain sensitive data.
- [Kenya Data Protection (General) Regulations, 2021](https://www.odpc.go.ke/wp-content/uploads/2024/03/THE-DATA-PROTECTION-GENERAL-REGULATIONS-2021-1.pdf): Regulations 15–18 cover commercial use, opt-out messages, and direct-marketing restrictions.
