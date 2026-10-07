
## 2024-10-07 - Fix Stored XSS in SVG Generation
**Vulnerability:** User input could be rendered directly into the DOM via `dangerouslySetInnerHTML` during SVG generation in `DeedPlanGenerator` and `MutationPlanGenerator`, resulting in stored XSS.
**Learning:** `dangerouslySetInnerHTML` should never be used without strict sanitization, even for internally generated SVGs where some data is based on user input (e.g. project name, annotations, SVG paths).
**Prevention:** Always use the centralized `sanitizeHtml` wrapper from `@/lib/security/sanitize` when rendering dynamically generated SVG or HTML with `dangerouslySetInnerHTML`.
