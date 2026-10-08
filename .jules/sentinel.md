## 2024-05-18 - [Fix Stored XSS in SVG Previews]
**Vulnerability:** Missing `sanitizeHtml` wrap on SVG strings in `DeedPlanGenerator` and `MutationPlanGenerator` passed to `dangerouslySetInnerHTML`.
**Learning:** Even though SVG renderers like `DeedPlanRenderer` attempt XML escaping, passing their unvalidated output directly to `dangerouslySetInnerHTML` risks XSS if any unescaped paths occur.
**Prevention:** Consistently apply DOMPurify (`sanitizeHtml`) whenever `dangerouslySetInnerHTML` is used for dynamic SVG/HTML, relying on defense-in-depth instead of trusting upstream escaping.
