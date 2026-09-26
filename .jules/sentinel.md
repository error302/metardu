## 2026-08-04 - [Missing Sanitization on SVG Outputs]
 **Vulnerability:** Unsanitized SVG generation outputs being injected into the DOM via `dangerouslySetInnerHTML` in `DeedPlanGenerator` and `MutationPlanGenerator`.
 **Learning:** SVG outputs generated on the client can contain XSS vectors if malicious input data is embedded into the SVG string. Even if the generators seem trustworthy, user input like project names or property details used in the SVG string can lead to stored XSS vulnerabilities when the SVG is rendered without sanitization.
 **Prevention:** Always wrap SVG strings with a secure sanitization library like DOMPurify (e.g., `sanitizeHtml`) before injecting them into the DOM using `dangerouslySetInnerHTML`.
