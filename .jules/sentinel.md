
## 2024-05-18 - XSS in SVG strings rendered via dangerouslySetInnerHTML
**Vulnerability:** Found `dangerouslySetInnerHTML` directly using unsanitized SVG strings (e.g. `svgOutput`, `output.svg`) generated from user input in `MutationPlanGenerator` and `DeedPlanGenerator`. Although some input is escaped, user-controlled names/fields ending up in the SVG could trigger stored XSS.
**Learning:** React requires explicit sanitization when pushing arbitrary XML/SVG via `dangerouslySetInnerHTML`. Just escaping certain parts or generating the SVG locally isn't enough if any input flows unchanged into attributes or `<text>` nodes that could embed malicious elements, even though `<svg>` itself can host `<script>` elements or `<foreignObject>`.
**Prevention:** Always wrap dynamically generated SVG or HTML string outputs in `sanitizeHtml()` from `@/lib/security/sanitize` before passing them to `dangerouslySetInnerHTML`.
