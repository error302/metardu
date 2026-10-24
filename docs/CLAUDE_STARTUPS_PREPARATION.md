# METARDU — Claude Startups preparation

Checked 23 October 2026. This is an application draft and evidence checklist;
no application, newsletter subscription or external message has been submitted.

## Current program status

Anthropic's [canonical program page](https://claude.com/programs/startups)
currently says the cohort is full and new applications are closed. The
[announcement](https://claude.com/resources/articles/were-expanding-the-claude-startups-program-to-help-founders-build)
also carries an update dated 13 October confirming closure. Recheck the
canonical page when applying; do not treat older application buttons, eligibility
descriptions or benefit amounts as a presently open offer. No reopening date
was verified. The official page points founders to its startup newsletter for
future openings; subscribing remains the founder's choice.

## Short product description — draft

METARDU is a web platform being built in Kenya for surveyors and engineering
teams to carry work from field records to reviewed draft deliverables. It brings
project setup, declared coordinate systems, observations, survey calculations,
maps and drawing/report preparation into one workspace. We are focusing on
preserving original measurements, making missing evidence visible and keeping
draft results distinct from professional approval.

## Problem and approach — draft

Survey teams often move observations between field books, calculation tools,
maps and drafting software. The handoffs can lose the relationship between an
output and the measurements, reference systems and revisions behind it. METARDU
aims to retain that relationship in a connected workflow, with explicit project
references, recoverable records and reviewable calculations and outputs. Our
current priority is validating a practical Kenyan survey workflow before making
broader claims about instrument compatibility or international acceptance.

## Proposed use of Claude — draft, not an existing integration claim

We would evaluate Claude for assisting with field-note interpretation, explaining
calculation results, identifying missing project information and preparing
reviewable report text. Any extracted observations would require user review
before entering a survey computation. Deterministic calculation engines and
explicit project references would remain the authority for numerical results;
the assistant would not certify boundaries, invent control or approve designs.
Private survey records would be shared only through an expressly configured,
consented workflow. We would also use Claude development tools for engineering
and evaluations, subject to available program terms.

The inspected source currently routes cloud AI through NVIDIA NIM
(`src/app/api/ai/chat/route.ts`, `src/lib/ai/nvidiaService.ts`), with a local
WebGPU path described in `src/lib/ai/smartAiService.ts`. This inspection does
not prove a deployed Claude integration. Do not say METARDU already runs on
Claude or is an Anthropic partner.

## Stage and evidence — draft

METARDU has an accessible web platform and an active codebase undergoing survey
workflow validation and production hardening. Availability at
[metardu.space](https://metardu.space/) was restored on 23 October after a
disconnected Cloudflare tunnel. Source, synthetic database, browser, production,
provider and physical field evidence are tracked separately. The full
production-readiness goal remains open.

For a reviewer demonstration, use the public sample and clearly identify its
synthetic data. Do not present the owner's home simulation, screenshot-derived
points or synthetic test fixtures as a measured legal boundary survey.

## Founder details to complete before an application

| Field | Required truthful entry |
| --- | --- |
| Company / brand | METARDU; confirm the legal entity name and registration status separately. |
| Founder | Confirm the founder's preferred and legal application names. |
| Website | https://metardu.space/ — recheck public access before submitting. |
| Business email | Confirm an owned mailbox that receives mail; the live site currently references multiple domains. Do not invent a metardu.space address. |
| Founding date and location | Founder must supply the actual date and jurisdiction. |
| Team, funding and investors | Founder must supply actual figures/status; no assumptions from the codebase. |
| Users, revenue and pilots | Supply verifiable, consent-safe figures and dates, or state pre-revenue / validation stage only if true. |
| Claude account and usage | Confirm the actual Console account and existing usage; proposed integration is distinct from deployed use. |

## Readiness boundaries for an honest pitch

- Source work: ongoing validation, concurrent unpromoted changes and additive
  migration 116 need release review. See `PRODUCTION_GOAL.md` and
  `PRODUCTION_READINESS_EXECUTION.md`.
- Live operations: public pages and database/Redis health passed after tunnel
  restoration. The public release ID remains `unknown`. Owner-approved delayed
  automatic tunnel startup and failure recovery are configured and read back;
  reboot/crash scenarios remain unexercised. See
  `PUBLIC_AVAILABILITY_2026-10-23.md`.
- Providers: 12 configured PayPal live plans passed read-only checks; that is
  not a completed customer purchase/webhook/cancellation lifecycle. Resend's
  configured key returned `restricted_api_key` for domain reads; no email was
  sent by these checks.
- External acceptance: independent control, instrument/field work, receiving
  CAD, paper/professional review, customer recovery and the previously deferred
  signing-key rotation retain their recorded gates. The startup program itself
  is closed to new applications at this check.

Do not submit the draft with unresolved placeholders or promise certification,
regulatory acceptance, guaranteed accuracy, customer traction, uptime SLAs or
provider partnerships that have not been established.
