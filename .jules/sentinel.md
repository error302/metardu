## 2026-09-23 - Prevent SVG XSS in Plan Generators

**Vulnerability:**
`DeedPlanGenerator` and `MutationPlanGenerator` rendered dynamic, user-controlled or computationally generated SVG strings directly into the DOM using `dangerouslySetInnerHTML` and `document.write` without sanitization. This introduced a significant Cross-Site Scripting (XSS) risk, where malicious `<script>` tags, `onload` handlers, or other vectors injected into project names, plot names, or computation errors could execute arbitrarily in the context of the surveyor's session.

**Learning:**
Even in purely client-side computational generators, any output that constructs markup dynamically from user input (like project names in `<title>` or plot labels in SVGs) must be considered tainted. Relying solely on XML escaping inside SVG strings is insufficient because those strings are ultimately parsed as HTML via `dangerouslySetInnerHTML`. The codebase already possessed a highly-tuned `sanitizeHtml` utility specifically configured for Next.js and the strict subset of safe SVG attributes needed by the plan renderers; failing to use it on all outputs was a critical omission.

**Prevention:**
Always run all raw HTML or SVG strings through `@/lib/security/sanitize`'s `sanitizeHtml` function *immediately* before passing them to `dangerouslySetInnerHTML` or writing them to new windows via `document.write`. Avoid assuming computational outputs are safe from injection if they incorporate user-provided identifiers or metadata.
