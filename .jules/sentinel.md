## 2024-05-18 - Fix XSS in Deed and Mutation Plans
**Vulnerability:** XSS vulnerability in `dangerouslySetInnerHTML` for `DeedPlanGenerator` and `MutationPlanGenerator` where output SVG is not sanitized.
**Learning:** When using `dangerouslySetInnerHTML`, always sanitize the content, even if it is generated dynamically or appears to be just SVG.
**Prevention:** Ensure that all dynamically generated HTML/SVG passed to `dangerouslySetInnerHTML` is passed through `sanitizeHtml` from `@/lib/security/sanitize` first.
