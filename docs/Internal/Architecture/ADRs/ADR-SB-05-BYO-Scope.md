# ADR-SB-05 — Build-Your-Own (BYO) Scope & Guardrails

## Status
Accepted — 2025-11-19

## Context
ApexMediation follows a BYO-credentials model where publishers keep network relationships and Apex only orchestrates auctions/analytics. We need a documented scope so SDKs/adapters never embed long-lived credentials and billing remains transparent.

## Decision
- **Credential Separation:** SDKs/adapters accept placement IDs + short-lived tokens only. Long-lived API keys remain in control plane services (see `backend/src/services/networkCredentialVault.ts`).
- **Network Ownership:** Publishers retain payouts directly from networks; Apex invoices a SaaS/usage fee only (documented in `docs/Internal/Operations/BILLING_PLAYBOOK.md`).
- **Config Delivery:** OTA-safe configs via staged rollout (1 → 5 → 25 → 100%) with kill switches per placement.
- **Scope Guardrails:** Adapters limited to rendering + monetization logic; reporting, billing, privacy live in backend/console.
- **Evidence Hooks:** SDK registries log metrics/tracing hooks; FIX-10 backlog captures deviations.

## Consequences
- BYO guarantees reduce custodial risk and align with non-negotiables in `Dev_Checklist_v1_1_VERIFY_FIRST.md`.
- Requires tight governance on credential endpoints and secrets stores.
- Documentation updates must reference this ADR when adding new network support to ensure no scope creep.
