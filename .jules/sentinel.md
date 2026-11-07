## 2026-11-07 - Sanitize Generated SVGs
**Vulnerability:** XSS vulnerability in dynamically generated SVGs inside DeedPlanGenerator and MutationPlanGenerator.
**Learning:** Raw SVG code is rendered directly using dangerouslySetInnerHTML, document.write, or interpolation in strings. If any data input used in SVG generation contains malicious payloads, it might trigger DOM-based or Stored XSS attacks since SVG code can contain <script> elements and handlers.
**Prevention:** Always use DOMPurify (wrapped in sanitizeHtml) for dynamically generated SVGs before rendering them, even if internal strings have been XML-escaped (Defense in Depth).
