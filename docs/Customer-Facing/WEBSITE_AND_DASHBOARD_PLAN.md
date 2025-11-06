# Website & Customer Dashboard Platform — Pre-FT Build Plan

Last updated: 2025-11-06
Owner: Product & Platform Engineering
Status: Plan v1 (coding-first, offline fixtures)

Purpose
- Deliver a full customer-facing website and multi-tenant dashboard/control hub BEFORE any external sandbox certification.
- Adhere strictly to our existing design docs and design system while enforcing industry-best UI/UX and accessibility standards.

Authoritative Design Inputs
- Website.docx (root)
- DESIGN_SYSTEM_IMPLEMENTATION_STATUS.md (root)
- docs/Customer-Facing/* (this folder)
- COMPONENT_REFERENCE_GUIDE.md (root)

Information Architecture (IA)
- Auth & Onboarding: Sign-in/Sign-up, 2FA, Tenant switcher.
- Overview (Home): Revenue, eCPM, Fill, Win-rate, Alerts (CB events, deadline overruns), Quick actions.
- Placements & Ad Units: CRUD, status, preview, test impressions, change history.
- Networks & Adapters: Enable/disable, credentials (masked), status, fill/error/latency metrics.
- Optimization: Floors (global/per-geo/device), Pacing/Capping, A/B/n Experiments.
- Fraud & Quality: Fraud stats, type breakdown, shadow-mode distributions, appeals workflow (stub).
- Analytics: Cohort/LTV, ARPDAU, retention overlays, breakdowns by country/device.
- Mediation Debugger: Recent auction traces with redacted payloads, timeline view.
- Billing & Reconciliation: Invoices (mock), revenue reports, discrepancy center (stub).
- Settings & Access: API keys (masked), Webhooks, RBAC roles, audit logs.

Design System & Components
- Use our design tokens and components per DESIGN_SYSTEM_IMPLEMENTATION_STATUS.md.
- Components: AppShell (Header/Sidebar/Content/Toasts), DataTable (virtualized), Charts (timeseries, bar, pie), Form controls, Empty/Loading/Skeleton states, Modal/Drawer, Stepper, Tabs.
- Theming: Light/Dark with WCAG-compliant contrast; High-contrast mode.
- i18n: English baseline; extraction pipeline ready.

UI/UX Excellence Guidelines (Must-pass)
- Accessibility: WCAG 2.2 AA or better; keyboard navigation; focus ring; aria labels; skip links; prefers-reduced-motion; color contrast ≥ 4.5:1.
- Usability: Nielsen heuristics, clear affordances, consistent controls, undo/rollback where possible.
- Performance Budgets (desktop on modest hardware): LCP < 2.5s, TTI < 3s, CLS < 0.1; JS < 300KB gzip per route (excluding charts when necessary).
- Responsiveness: Mobile, tablet, desktop breakpoints; touch targets ≥ 44px.
- State Design: Empty, loading, error, partial data, and success states for every page; optimistic updates where safe.
- Content: Plain language; tooltip helpers; inline docs and links.
- Security: CSRF protection, CSP headers (no unsafe-inline), rate limiting, audit logs; mask secrets by default.

Engineering Approach (coding-first, offline)
- Framework: Use existing website/src (React/TS) with routing, code-splitting, and component library.
- Data: Mock API layer with deterministic fixtures and MSW/Express stubs; no external creds.
- Testing: Unit tests for components; integration tests for major flows; Lighthouse CI for perf/a11y.
- Redaction: Mediation debugger views redact PII, tokens, and sensitive payload fields using a shared redaction util.

Acceptance Criteria (to complete Pre-FT Website stage)
- End-to-end clickable flows for: Placements CRUD, Adapter toggles, Floors setup, A/B experiment creation, Fraud dashboard view, Mediation debugger view (sanitized traces), Billing mock.
- Lighthouse scores (desktop): Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90.
- Automated a11y tests pass (axe-core) with zero critical violations.
- Screenshots and short walkthrough recorded and linked from docs.

Deliverables
- Implemented routes and pages under website/src with mocks and tests.
- Redaction utilities and fixtures.
- CI job for Lighthouse and a11y on key routes.
- Documentation: this plan + a Usage Guide with screenshots.
