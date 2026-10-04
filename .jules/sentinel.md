## 2024-10-04 - Fix Unsanitized dangerouslySetInnerHTML in Plan Generators
**Vulnerability:** Found two instances (`DeedPlanGenerator.tsx` and `MutationPlanGenerator.tsx`) where SVG output strings (`output.svg` and `svgOutput`) were passed directly into `dangerouslySetInnerHTML` without being sanitized. This allows stored XSS vectors.
**Learning:** Even though SVGs might just seem like drawing paths, they can include dangerous tags like `<script>`, `onload` attributes, or `<foreignObject>`, allowing XSS execution when rendered on a React canvas.
**Prevention:** Always wrap dynamically generated or user-influenced HTML/SVG string structures with the standard `@/lib/security/sanitize` wrapper function `sanitizeHtml` before passing to `dangerouslySetInnerHTML`.
