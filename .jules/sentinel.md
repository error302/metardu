## 2024-05-24 - Fix Stored XSS in Plan Generator SVG Preview

**Vulnerability:** The application was vulnerable to Stored XSS because `dangerouslySetInnerHTML` was used in `DeedPlanGenerator.tsx` and `MutationPlanGenerator.tsx` to render dynamically generated SVG content (`output.svg` and `svgOutput`) without passing it through a sanitizer first. While the deed plan API performs some XML escaping on user inputs, depending purely on upstream sanitization is a weak security model.

**Learning:** Any dynamically generated SVG content that receives user input MUST be sanitized via DOMPurify on the client side before being injected via `dangerouslySetInnerHTML`. React does not sanitize `dangerouslySetInnerHTML`. The project provides `sanitizeHtml` from `@/lib/security/sanitize` which allows inert SVGs. Overlooking this when displaying server/worker-generated SVGs leaves the door open for stored XSS.

**Prevention:** Always wrap dynamically generated strings intended for `dangerouslySetInnerHTML` with `sanitizeHtml`, particularly SVG payloads which have complex inner structures that might obscure XSS payloads if not properly parsed and stripped by DOMPurify.
