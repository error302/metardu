# PWA installation and phone acceptance — 29 October 2026

Current status: the combined application was deployed as 305d2b01 on 30 October. See [current release acceptance](RELEASE_ACCEPTANCE_2026-10-30.md) for revision-bound evidence, retained incidents and remaining physical/provider gates. Earlier checkpoint observations below are historical.

This extends the dashboard/activity checkpoint d1417c47. No application image has been built or promoted for that checkpoint; its successful source admission is retained and the combined revision must pass its own checks before one planned promotion.

## Defects corrected

The navbar prevented the native install event but discarded its stored prompt. A separate global banner and fieldbook banner each owned the same single-use event; the latter also registered a background-sync tag without a corresponding service-worker handler. The global banner did not handle prompt rejection or appinstalled, missed desktop-mode iPads, and lost its event on route changes.

PWAInstallProvider now owns the event once at the root. It preserves it across route changes, prevents concurrent/repeated consumption, catches native errors and clears state on appinstalled/standalone launch. Prompt acceptance is shown as an installation request until the browser supplies its completion signal. No browser storage, survey records, CAD drawings or account permissions are changed by installation handling. The ordinary dismissal preference remains a guarded, user-triggered local preference.

The fieldbook duplicate and unused navbar listener were removed. The banner stays in normal document flow with touch targets and no modal over the workspace. The public /install guide provides Android, iPhone/iPad and desktop steps even when no automatic prompt is available. Landing visitors can use “Install the app”; the dashboard entry remains in the navbar. The footer also links the guide. The guide and public connection-help page use the minimal shell.

## Manifest and worker

The stable manifest id and scope remain /, start_url remains /dashboard?source=pwa, and display remains standalone. The app name is METARDU, with factual survey-workspace wording rather than an unsupported legal-compliance claim. All declared icons (192/512 included), shortcuts and the Apple touch icon match their PNG dimensions. Existing full-bleed artwork is advertised as any-purpose, not incorrectly as maskable. No artwork was replaced.

Missing screenshots were removed. Experimental OS file/protocol/share associations were removed from the manifest: the current import page does not consume launchQueue or the shared-file/deep-link delivery parameters. Ordinary explicit import routes remain available; manifest associations need their own receiving-flow acceptance before they are advertised again.

Manifest responses revalidate with application/manifest+json. The root worker revalidates with no-store and explicit / scope. Existing NetworkOnly navigation, public /offline fallback, uncached private HTML/API behavior, no automatic reconnect reload, skipWaiting=false and clientsClaim=false remain. Installing does not make the entire app available offline, and the guide says so. Do not clear or rewrite user storage/caches to test installation.

## Evidence and remaining acceptance

Source preview at the owned 127.0.0.1:3021 origin rendered the guide and both phone instructions without alerts or horizontal overflow at width 390. This is layout evidence; development PWA registration is deliberately disabled. The preview was stopped and only its generated next-env type reference was restored.

Focused tests cover prompt single-use, competing entry points, route changes, accepted/dismissed/rejected prompts, actual appinstalled, standalone launches, iPad detection, listener cleanup, manifest assets, service-worker updates and connection recovery. The combined pinned source checks, exact CI, candidate runtime and deployed asset receipts are required for the final revision.

The owner can test both Android Chrome and iPhone/iPad Safari. Physical acceptance remains: install from the live guide, verify the Home Screen icon and separate app window, sign in (including Google), open a project, close/reopen, and check saved/delivery status while connected. Do not claim an OS installation, cold offline workflow, field/instrument result or complete platform readiness from unit tests or a resized desktop viewport.

Primary installation references: [Chrome install criteria](https://web.dev/articles/install-criteria), [Apple Home Screen web apps](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios), [MDN install choice](https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent/userChoice).

Keep existing field/receiving-CAD/print/provider/offsite-key recovery, signing-key rotation and Cloudflare legacy parcel gates. The large Workbox chunk remains outside precache; no cache-size limit was raised to conceal it.
