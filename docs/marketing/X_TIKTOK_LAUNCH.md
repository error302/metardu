# METARDU organic launch assets

Prepared 16 October 2026. These are illustrative motion graphics, not recordings
of the live application. No customer records or third-party footage/music appear.

## X launch post

Surveyors: meet METARDU.
Survey calculations, maps, CAD tools and project records in one workspace.
Built in Kenya for the work between field observations and delivery.
Explore the tools and create your account: https://metardu.space
#Surveying #Geomatics

Published from the account linked in METARDU's footer, with the first animation:
https://x.com/itsdosho/status/2110892114406174764

CUA verified the final post page, matching copy and embedded 15-second video.
Its screenshot is `artifacts/marketing/metardu-launch/x-post-published.png`.
No paid campaign or advertising spend has been started.

## Three vertical animations

The locally rendered MP4s are in `artifacts/marketing/metardu-launch/` (excluded
from Git and Docker build context). Each is 1080 x 1920, 24 fps, 15 seconds,
H.264/AAC. Their combined file size is approximately 1.8 MB.

| File | Opening hook | Suggested caption |
| --- | --- | --- |
| `01-your-survey-one-workspace.mp4` | Your survey. One workspace. | Survey calculations, maps, CAD tools and project records. Explore METARDU at metardu.space. #Surveying #Geomatics |
| `02-see-the-numbers.mp4` | Know the numbers. See the work. | Distance, bearing and area tools for your next check. Explore METARDU. The 30/40/50 m triangle is an illustrative example. #LandSurveying |
| `03-part-of-your-workflow.mp4` | Built for surveyors. Shaped with you. | Bring your workflow. Tell us what slows you down between the field record and delivery. Create your METARDU account at metardu.space. #Surveyors |

All three show the existing company icon and retain professional-review wording.
They use original procedural audio and original diagrams. The coordinate
example preserves the 30:40 geometry ratio. The third ad presents a conceptual
workflow, not a claim that every field/document handoff is automated.

Re-render with existing Python/Pillow and FFmpeg on PATH:

```powershell
python scripts/render-metardu-launch-ads.py
```

No new dependencies, containers or paid generation credits were used. Windows
Segoe UI/Consolas are used for rasterized text; the script does not redistribute
font files. The manifest records dimensions and asset provenance. Each encoded
file passed ffprobe inspection and a full FFmpeg decode. Actual frame samples
at 1, 7 and 13 seconds were visually inspected in `video-contact-sheet.jpg`.

## Launch approach

Start with organic posts while collecting product feedback. Use one hook per
post, then compare link visits, account creation and the first useful tool or
project action. Use platform-specific UTM links when analytics attribution is
implemented and consent requirements are satisfied. Reach is not a conversion.

Invite surveyors to try one familiar calculation, compare against their known
result, then use a synthetic project before introducing customer work. Do not
promise legal certification, receiver accuracy, a public ChatGPT listing or an
end-to-end automated survey firm. Do not advertise unreleased map improvements
as already available on the public deployment.

The user will create the TikTok account. Account signup, publishing and paid ad
buying are not evidence of production or field readiness.
