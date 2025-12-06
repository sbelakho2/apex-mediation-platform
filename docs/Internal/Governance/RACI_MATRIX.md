# Governance RACI Matrix — Core Surfaces

> **VERIFY-FIRST:** Confirm Part 0 of `Dev_Checklist_v1_1_VERIFY_FIRST.md` before modifying any responsibilities here. Evidence links per row map back to CODEOWNERS, runbooks, and deployment docs so we can prove ownership before shipping work.

This matrix establishes Responsible, Accountable, Consulted, and Informed roles for each surface called out in Part 0 of the VERIFY-FIRST checklist. Roles reference GitHub teams (from `.github/CODEOWNERS`) plus the canonical document each team keeps current.

| Surface | Responsible (R) | Accountable (A) | Consulted (C) | Informed (I) | Evidence |
| --- | --- | --- | --- | --- | --- |
| SDKs (Android, iOS, Unity, Web/CTV) | `@bel-consulting/sdk-owners` (SDK Platform Eng) | `@bel-consulting/ad-stack-maintainers` (Product/Eng leads) | Product Ops, SRE | Support, Sales | `docs/Internal/Development/SDK_IMPLEMENTATION.md`, `.github/CODEOWNERS` |
| Adapters & Auction Core | `@bel-consulting/backend-owners` | `@bel-consulting/ad-stack-maintainers` | SDK Eng, Observability | SRE, Support | `backend/Adapters.md`, `backend/auction` README |
| Observability & Reporting | `@bel-consulting/platform-infra` | `@bel-consulting/ad-stack-maintainers` | Data/ML, Billing | All engineering | `docs/Internal/Infrastructure/observability.md`, `docs/Monitoring/ALERTS.md` |
| Billing & Business Systems | Billing Eng rotation (`billing@apexmediation.ee`) | CFO / Biz Ops lead | Support, Legal, Privacy | Account Mgmt | `docs/Internal/Operations/BILLING_PLAYBOOK.md`, `docs/Internal/Security/DATA_MAP.md` |
| Privacy & Security | Security Eng (`security@apexmediation.ee`) | CTO | Legal, SDK Eng, Backend | Entire company | `docs/Internal/Security/COMPREHENSIVE_AUDIT_REPORT.md`, `docs/Internal/Security/DATA_RETENTION_MATRIX.md` |
| Reporting & Analytics | Data Eng (`contact@apexmediation.ee`) | VP Analytics | Billing, Product | Sales, CS | `docs/Internal/Development/ANALYTICS_IMPLEMENTATION.md`, `data/schemas` README |

## Escalation Notes

1. **R owns day-to-day execution** (e.g., merging PRs, running tests, updating docs).
2. **A signs off on scope** and ensures acceptance criteria align with FIX-10 governance plus VERIFY-FIRST evidence.
3. **C roles are looped in before decisions** impacting their domains (e.g., SDK feature toggles that change backend contracts).
4. **I roles receive release notes/status updates** via status page posts, release summaries, or weekly emails.

Document history, coverage, and rotation details live in the linked evidence so audits can trace responsibilities back to actual owners.
