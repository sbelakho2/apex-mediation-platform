# Website & Customer Dashboard Overview

Last updated: 2025-11-23

The ApexMediation website and dashboard give publishers a single place to manage monetization, review analytics, and keep billing in sync. This document summarizes the current experience so you can quickly find the tools you need.

## Key Areas

- **Authentication & Onboarding** — Secure sign-in with optional two-factor authentication, tenant switching for multi-app publishers, and guided onboarding tasks for new accounts.
- **Overview (Home)** — Real-time revenue, eCPM, fill, win-rate, and alert cards for circuit breaker events or SLA breaches. Quick actions jump directly to placement edits or credential updates.
- **Placements & Ad Units** — Create, edit, pause, or archive placements. Preview unit metadata, trigger test impressions, and review change history for compliance audits.
- **Networks & Adapters** — Enable or disable adapters, manage masked credentials, and inspect fill/error/latency metrics with filters for geo, device, and format.
- **Optimization** — Configure global or geo/device-specific floors, pacing, frequency caps, and controlled A/B/n experiments. Each change records responsible users and rollback notes.
- **Fraud & Quality** — Monitor invalid traffic trends, investigate shadow-mode decisions, and submit appeals when traffic is incorrectly flagged.
- **Analytics** — Break down LTV, ARPDAU, retention, country/device mixes, and cohort performance with exportable CSVs.
- **Mediation Debugger** — View sanitized auction traces, timelines, and transparency receipts aligned with SDK logs.
- **Billing & Reconciliation** — Download invoices, compare revenue reports, and open discrepancy tickets when network statements diverge.
- **Settings & Access** — Rotate API keys, configure webhooks, manage RBAC roles, and review audit logs.

## Design & Accessibility

- Light and dark themes maintain WCAG 2.2 AA contrast, high-contrast mode, and prefers-reduced-motion support.
- Full keyboard navigation, focus rings, skip links, aria labels, and descriptive tooltips help every team member stay productive.
- Responsive layouts keep features usable on laptops, tablets, and phones; touch targets remain at least 44px.

## Performance & Reliability

- Core web vitals target LCP < 2.5s, TTI < 3s, CLS < 0.1 on mainstream hardware.
- All critical views implement loading, empty, partial, and error states with actionable guidance.
- Telemetry and logs automatically redact credentials, consent strings, and user identifiers before leaving the browser.

## Getting Started

1. Sign in at https://console.apexmediation.ee with your organization credentials and enable 2FA when prompted.
2. Complete the onboarding checklist on the Overview page (placements, credentials, consent, billing).
3. Invite teammates via Settings → Access Control and assign roles (Admin, Finance, Analyst, Read-only).
4. Use the Mediation Debugger and Transparency sections to verify SDK integrations before promoting to production.

## Support & Feedback

- Need help? Use the in-app support widget or email support@apexmediation.ee with your organization ID.
- Feature ideas are welcome—submit them through Settings → Feedback so the product team can review them with you.
