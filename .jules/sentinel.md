## 2025-05-24 - Cross-Site Scripting (XSS) via Unsanitized SVG Generation
 **Vulnerability:** Unsanitized variables (`output.svg` and `svgOutput`) were being passed directly into `dangerouslySetInnerHTML` in `src/components/deedplan/DeedPlanGenerator.tsx` and `src/components/mutationplan/MutationPlanGenerator.tsx`.
 **Learning:** SVG outputs generated programmatically can be prone to injection if the user-entered input (e.g. project name or arbitrary text) isn't correctly escaped before rendering into the `<svg>` output. Even though logic generated the SVGs, there was still an XSS vector from user data inside those strings.
 **Prevention:** Use DOMPurify via the wrapper `sanitizeHtml` (`@/lib/security/sanitize`) before using `dangerouslySetInnerHTML`.
