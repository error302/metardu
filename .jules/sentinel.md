## 2024-10-25 - XSS via SVG Rendering
**Vulnerability:** Unsanitized SVG strings rendered using `dangerouslySetInnerHTML` in `DeedPlanGenerator` and `MutationPlanGenerator`.
**Learning:** Even generated SVG content can contain malicious `<script>` tags or foreign objects if the input data used to generate the SVG is not properly escaped or sanitized.
**Prevention:** Always sanitize SVG content before rendering using a strict DOMPurify configuration (like the one in `sanitizeHtml`) to remove any potentially malicious elements while preserving geometry.
