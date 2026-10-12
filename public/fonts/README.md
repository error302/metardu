# METARDU local fonts

These assets keep the existing Instrument Serif, JetBrains Mono, Newsreader and
Geist typography without contacting Google Fonts during builds or page loads.
The stylesheet is `src/app/fonts.css`; every binary has a full SHA-256 entry in
`manifest.json`. The 18 WOFF2 files total 316,068 bytes across all language subsets;
the browser downloads the families, styles and Unicode subsets actually used.

Instrument Serif, JetBrains Mono and Newsreader binaries and their original
Unicode ranges were recovered unchanged from the successful local image
`metardu-release-verify:20261008-print-readability` on 2026-10-08. Geist was retrieved
from the same Google Fonts stylesheet URL previously used by the root layout:
https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap

All four fonts use SIL Open Font License 1.1. Copyright notices and the complete
licenses are included alongside these assets, copied from their official sources:

- https://github.com/google/fonts/blob/main/ofl/instrumentserif/OFL.txt
- https://github.com/google/fonts/blob/main/ofl/jetbrainsmono/OFL.txt
- https://github.com/google/fonts/blob/main/ofl/newsreader/OFL.txt
- https://github.com/google/fonts/blob/main/ofl/geist/OFL.txt

Do not overwrite a fingerprinted asset when updating fonts: add a new filename,
update the stylesheet/preload and manifest, and retain the appropriate license.
