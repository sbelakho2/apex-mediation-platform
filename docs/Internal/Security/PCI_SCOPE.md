## PCI Scope — Billing (Stripe)

Last updated: 2025-11-12
Owner: Security/Platform

Summary
- We do not handle raw cardholder data (CHD) on our servers or in our Console.
- All payment collection and management is delegated to Stripe-hosted surfaces (Stripe Elements/Checkout and Customer Portal).
- Target PCI scope: SAQ-A.

Key points
- Console Billing Settings links users to the Stripe Customer Portal; no card forms are embedded in our domain.
- Webhooks from Stripe are signature-verified and contain no sensitive PAN data; we persist only metadata/ids.
- Secrets (Stripe keys) are stored in environment/secret store and rotated per runbook.
- Logs and audit tables are redacted of PII and do not store full card details.

Controls
- TLS 1.2+ everywhere; HSTS enabled in production.
- Security headers middleware sets CSP, Referrer-Policy, Permissions-Policy, X-Content-Type-Options.
- Admin actions audited to `billing_audit` with actor attribution.

Evidence
- Console Settings → Stripe Portal deep link.
- Middleware: `backend/src/middleware/securityHeaders.ts`.
- Webhooks: `backend/src/routes/webhooks.routes.ts`.

Gaps/Notes
- Periodically review Stripe’s guidance for hosted payment pages to ensure continued SAQ-A eligibility.
- Ensure marketing website also avoids embedding card forms.
