## 2026-08-30 - Fix XSS in SVG Map Generators

**Vulnerability:**
Both `DeedPlanGenerator.tsx` and `MutationPlanGenerator.tsx` rendered user-generated, potentially unsafe SVG strings directly using `dangerouslySetInnerHTML`. In `MutationPlanGenerator`, `svgOutput` came from `renderFormNo3()` containing user input mapped via `projectInfo.name`, etc. that was rendered unsanitized. While there was a comment indicating XSS guard escaping at the interpolation level, applying `sanitizeHtml` to `dangerouslySetInnerHTML` directly guarantees that DOM-based XSS or stored XSS vulnerabilities aren't introduced by incomplete escaping or missing layers.

**Learning:**
`dangerouslySetInnerHTML` with raw SVGs generated locally from user state or from APIs (even if API output is believed safe) can carry significant XSS vectors if attributes or tags are missed during manual escaping. The internal `@/lib/security/sanitize` wrapper using DOMPurify should ALWAYS be applied directly around `dangerouslySetInnerHTML` injections, especially for SVGs which are natively executable contexts.

**Prevention:**
Always import `sanitizeHtml` from `@/lib/security/sanitize` and wrap any dynamically generated HTML/SVG passed into `dangerouslySetInnerHTML`, e.g., `dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}`.
