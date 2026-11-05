# Deployed retained PDF browser acceptance - 5 November 2026

Exact deployed application: 7290f5c4234b2cd94e3c5dfb399c34d074fdd444; image sha256:20a3f3c2df436a84a05da161618ee867bdf850238373cda2aa28e95f80824c55.

The actual authenticated app loaded existing Enterprise synthetic project 242f3a64-f1cf-4b7f-96a0-70e86aa5b616 and selected existing surface revision 408583cf-7da5-4653-8fd6-bb056ab7ce27. The UI identified 42 observations, four contour levels, 0.5 m interval, EPSG:21037 and the explicit synthetic local benchmark/no field control. No new observation, surface or contour computation was created.

One click on Download draft PDF created document revision 2 and downloaded a 21,275-byte PDF. SHA-256: 4c9b3b5394760ca87d64c16a3651215ee3a4157d9043bb105000eea7de091332. One click on Download saved PDF again returned identical bytes. A subsequent read-only PostgreSQL check found exactly the original and new PDF registrations, with matching hash, byte count and source revision. The GET re-download created no third registration.

Poppler reports one unencrypted A3 landscape page (1190.55 x 841.89 pt), produced by PDFKit. The rendered complete page has all 42 point labels, four contour levels, nominal 1:500 scale, separate legend/north/scale/reference panels and explicit COMPUTED DRAFT/review pending wording. Visual review found no observed label-label overlap or clipping. This is visual and artifact-integrity evidence, not calibrated physical print, independent-surveyor, field-accuracy or receiving-CAD acceptance.

The original revision-1 A2 file and its registered SHA-256 fef3230f6c71a72f65c77f3dfd556d62c9aed5dcf33b64a0ca98b7ea0d72f685 remain unchanged. The original request-ID lookup/replay is still a separate unperformed browser acceptance step; the successful new-file GET re-download is not relabelled as that proof.

The export registration is an intentional synthetic deliverable/file-register addition. It must not be described as a zero-write acceptance or as a changed application release. Existing customer survey data, plans and memberships were not changed.

Evidence under C:/Users/user/.codex/visualizations/2026/10/22/01a165b5-7f3e-74f2-8335-e70c5dd35dcf/:

- web-7290f5c4-registered-R1-A3.pdf and its Poppler PNG.
- web-7290f5c4-registered-R1-A3-verification.json (read-only register/hash/count assertions).
- web-7290f5c4-registered-pdf-success.png (actual UI download acknowledgement).
- verify-registered-a3.cjs (read-only verifier).

The approved X walkthrough is separately live at https://x.com/itsdosho/status/2118405747184648656. Do not repost it or describe it as a collaboration/pairing demonstration.
