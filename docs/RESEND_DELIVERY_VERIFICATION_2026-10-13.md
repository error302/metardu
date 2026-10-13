# Resend delivery verification — 2026-10-13

## Result

One owner-authorized delivery test was sent from `METARDU <noreply@metardu.space>` through the connected Resend account. Resend's message record reported **delivered** at 2026-10-13 14:49 UTC. The message used the METARDU email-mark PNG as an inline CID attachment, the branded dark layout, a plain-text alternative, and privacy/help links.

The message was explicitly identified as a delivery test. It contained no account-verification token, subscription action, or marketing offer. No campaign or reminder email was sent.

## Evidence boundary

This proves that the connected Resend account accepted and delivered one branded message from the selected sender. It does not prove that the production app's deployed verification-email endpoint is configured with the same credentials or successfully delivers end to end. The source email templates and Resend adapter have focused automated tests; a production signup or verification-link flow remains unverified until the existing application runtime is reachable and safely checked.

The test used an inline logo attachment, so it did not depend on the public `/metardu-email-mark.png` asset route, which was previously observed returning 404 in production.
