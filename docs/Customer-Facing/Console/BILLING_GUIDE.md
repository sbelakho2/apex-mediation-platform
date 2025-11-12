Console Billing Guide

This guide explains how to use the Console billing pages to view usage, invoices, and manage billing settings.

Sections
1. Usage
- Navigate to Billing → Usage to see current period usage and limits.
- Tooltips explain each metric; export CSV available where enabled.

2. Invoices
- Billing → Invoices shows a paginated list of invoices.
- Click an invoice to view details; use the PDF link to download a copy.

3. Settings
- Billing → Settings: update billing contacts, view Customer Portal, and manage payment methods via Stripe Portal.

Troubleshooting
- If invoices do not load: check feature flags on the Admin → Health page; verify network errors in DevTools.
- PDF link not working: ensure you are logged in and that the invoice exists; try again after a few minutes.
- For billing issues, contact support with your organization ID and the invoice number.

Screenshots
- Include representative screenshots in PRs affecting Billing UI. (Screenshots can be captured via Playwright during CI failures and stored under console/playwright-report.)

References
- Backend API: docs/Backend/BILLING_API.md
- E2E smoke: quality/e2e/billing/usage-to-invoice.spec.ts
