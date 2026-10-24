# METARDU public availability — 23 October 2026

## Observed incident and repair

At approximately 16:43:58 UTC the production origin returned healthy HTTP 200,
but `https://metardu.space/`, `/pricing`, `/login` and `/api/public/health`
returned HTTP 530 with Cloudflare tunnel error 1033. A host check found no
running cloudflared connector. The existing `Cloudflared` Windows service was
stopped and disabled.

The existing `scripts/start-metardu-tunnel.ps1` was used with the existing local
token file and installed vendor binary. It started one hidden connector at
16:44:30 UTC. No token was printed, no DNS or service-startup policy was changed,
and no application container, customer record, migration or signing key was
changed. The owner's signing-key rotation deferral remains in force.

The initial restricted Docker/network checks were access failures, not evidence
that production was stopped. The normal host-access production verifier then
passed. No duplicate application or new build was created.

## Verification

At 16:46:08 UTC the retained read-only HTTP check passed:

| Endpoint | Result |
| --- | --- |
| Origin `/api/public/health` on port 3000 | 200, healthy; database and Redis OK |
| Public `/` | 200; METARDU page title |
| Public `/pricing` | 200; Pricing — METARDU page title |
| Public `/login` | 200; METARDU page title |
| Public `/api/public/health` | 200, healthy; database and Redis OK |

The public homepage, pricing and login pages also rendered in the in-app browser after
the repair. This check did not sign in, submit a payment or alter browser
storage. The public health response reports release ID `unknown`; availability
does not prove that the latest source has been promoted.

Receipts: `.cache/public-availability/current.json` and its fixed-endpoint
read-only helper `verify.mjs`; provider details in
`.cache/provider-readiness/current.json`. These local receipts contain no
credentials. A completed backup at `2026-10-23T10:25:43Z` was reported by
`npm run docker:verify`; this is archive/header evidence, not a restore exercise.

## Provider and integration boundaries

Read-only provider diagnostics at 16:45:20 UTC returned:

- PayPal live credential exchange: HTTP 200. All 12 Pro/Team/Firm plans across
  USD/EUR/GBP/AUD matched the source monthly catalog, with zero setup fees.
  Customer approval, paid entitlement, webhook replay and cancellation remain
  separate lifecycle requirements.
- Resend domain read: HTTP 401 `restricted_api_key`; sender configuration is
  present. A send-only/restricted key cannot establish domain-read status.
  These checks sent no email and do not prove inbox delivery.
- ChatGPT notice: waiting, not eligible, linking not configured; eligibility
  timestamp `2026-11-10T17:56:45.516Z`. Deployment and human consent remain gates.
- The payment API's automatic M-Pesa provider flag is false. The rendered
  pricing page separately describes a manual Till receipt-review workflow;
  these are different paths, not proof of automated M-Pesa checkout.

## Approved persistent tunnel recovery

The owner explicitly approved automatic recovery during this work. After the
Windows administrator consent, the existing `Cloudflared` service was changed
to delayed automatic startup with restart delays of 5, 15 and 60 seconds, a
24-hour failure-count reset, and recovery on non-crash failures. Its command
now references the existing token file instead of an inline token. The owned
manual connector was replaced with the service connector; independent inspection
found one cloudflared process, matching the running service PID.

`scripts/enable-metardu-tunnel-recovery.ps1` retains exact preflight ownership
checks and an in-memory configuration rollback. This is a guarded one-time
handover helper, not a general routine status command; its admission requires
the existing stopped service and exactly one owned manual connector. Without
`-Apply` it reviews the change without modifying service settings. Applying it
requires administrator access and the owner's persistent-setting approval.

The first attempt failed because legacy Windows PowerShell quoting caused
`sc binPath` to return code 1639. Inspection confirmed the service remained
disabled with its original command and the manual connector remained running.
The corrected helper uses CIM for the quoted command and rollback. The second
attempt passed at 16:52:42 UTC. The retained sanitized receipts are
`.cache/public-availability/service-recovery-first-attempt.json` and
`service-recovery.json`; no old command containing a token is written there.

After the service handover, all five origin/public HTTP checks passed again
at 16:53:21 UTC. The homepage was left open, with browser evidence saved at
`.cache/public-availability/live-home.png`. Automatic startup and failure
actions are configured and read back; a Windows reboot or forced production
connector crash was not performed, so those recovery scenarios are not claimed
as exercised.

This host must remain powered, connected and running its existing production
stack for public access. Moving to independently hosted infrastructure and
external alerting remains a distinct operational project.

## Separate work and external blockers

Source: current unpromoted source and migration 116 require coordinated release
and recovery review. Live: unknown release identity, reboot/crash recovery
acceptance, ordinary account/provider lifecycle and customer restore acceptance
remain open. External: actual field/instrument/professional acceptance and the
closed Claude Startups cohort remain outside this availability repair. See
`CLAUDE_STARTUPS_PREPARATION.md` and the active production goal.

## Subsequent availability check

The read-only host-network check passed again at 19:20:58 UTC: origin health,
public home, pricing, login and public health all returned 200. Public health
still reports release ID `unknown`. New source fixes are therefore not claimed
as deployed. A preceding restricted-network attempt failed with EACCES/ENOTFOUND;
that was an access restriction, not evidence of another public outage.

## Network interruption observed on 24 October

A subsequent public check returned 530 while the origin remained healthy. The
running service had zero active tunnel connections and logged resolver errors.
It reconnected automatically; a guarded manual restart refused admission once
the connection state recovered, so no restart actually ran. All five checks
returned 200 at 00:38:04 UTC, with four active connector connections. See
`TUNNEL_NETWORK_RECOVERY_2026-10-24.md` for the evidence and remaining operations
acceptance. Service configuration does not establish uninterrupted availability.
