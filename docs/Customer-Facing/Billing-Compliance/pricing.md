# Pricing

_Last updated: 2025-11-24_  
_Owner: Business / Finance Team_  
_Review Cycle: Quarterly or when pricing changes (next review: 2026-02-28)_  
_Status: Active_

> **Pricing notice:** Rates shown here are current and subject to change with 30 days’ advance notice. Your monthly invoice reflects the authoritative amount owed.

> **Launch status:** ApexMediation is operating a Bring-Your-Own (BYO) control plane. You bring network credentials and accounts; we orchestrate auctions, observability, fraud tooling, and transparency. Managed demand will be announced separately.

Transparent platform fees tied directly to the revenue you already earn.

---

## What You’re Paying For (BYO)

Because you own every network relationship, ApexMediation does **not** resell media or take custody of demand. The platform fee covers:

1. **The mediation/auction brain** – unified waterfall + HB + pacing/floor guardrails and policy automation.
2. **Observability & debugging** – metrics, SLO dashboards, mediation debugger, adapter-level traces.
3. **Fraud & quality tooling** – shadow ML, anomaly alerts, and IVT guardrails tuned for BYO.
4. **Migration & cryptographic transparency** – Migration Studio, signed logs, reproducible auctions, and transparency receipts.
5. **Convenience & consolidation** – one SDK, one console, one integration instead of managing 10+ adapters per app.

The fee is a **platform fee on gross mediated revenue**, not a margin on ad spend that we control.

---

## BYO Platform Fee Tiers

All tiers are based on **gross mediated revenue per app portfolio per month** (what the networks pay you before our fee). Fees scale smoothly; there are no cliffs.

| Tier | Gross Mediated Revenue (Monthly) | Platform Fee | Key Inclusions |
|------|----------------------------------|---------------|----------------|
| **Tier 0 — Starter** | $0 – $10,000 | 0% (free) | Full SDKs (Android, iOS, Unity, Web, TV), up to 5 apps, core analytics, basic debugger. Goal: remove friction for small teams. |
| **Tier 1 — Growth** | $10,001 – $100,000 | 2.5% of mediated revenue | Everything in Starter **plus** advanced observability (adapter metrics, SLO dashboards), Migration Studio, email/Slack support with baseline SLA. |
| **Tier 2 — Scale** | $100,001 – $500,000 | 2.0% of mediated revenue | Everything in Growth **plus** priority support, custom dashboards & exports (BigQuery/S3), early access to fraud/ML features while they run in shadow mode. |
| **Tier 3 — Enterprise** | $500,000+ | Custom (typically 1.0–1.5%) + minimum monthly fee | Everything in Scale **plus** contractual SLAs, custom onboarding/migration help, dedicated Slack channel, quarterly reviews, and bespoke compliance requirements. |

### Worked Examples

- **Starter example:** A small studio earns $8,000 this month. The platform fee is 0%. You pay $0 and keep the full $8,000.
- **Growth example:** A studio earns $50,000. The fee is 2.5% of $50,000 = **$1,250**. You receive $48,750.
- **Scale example:** A portfolio earns $250,000. The fee is 2.0% of $250,000 = **$5,000**. You receive $245,000.
- **Enterprise example:** A publisher earns $900,000. The negotiated fee is 1.25% + a $5k minimum. Effective fee = max($11,250, $5,000) = **$11,250** plus any contracted minimum adjustments.

Fees are calculated on IVT-adjusted revenue after network clawbacks. Negative adjustments roll forward to prevent gaming.

---

## Optional Add-Ons (BYO-Compatible)

These services never take custody of your demand; they layer on top of BYO:

- **White-label console** – Flat monthly fee **or** +0.25% platform fee uplift per tenant.
- **Extended data retention / premium analytics** – Per-month surcharge for additional lookback windows and advanced modeling.
- **Hands-on migration services** – One-time consulting fee per studio for adapter mapping, QA, and on-site support.

---

## Why This Model Fits BYO

- **No network credentials change hands.** SDK adapters use your accounts, so compliance and rev rec stay simple.
- **Aligned incentives.** Our revenue is tied to how much value we mediate for you, not which networks you use.
- **Simple message.** “We take 0–2.5% of the revenue you already earn, in exchange for better fill, fewer crashes, and full transparency.”
- **Predictable scaling.** As your mediated revenue grows, the effective fee rate drops and unlocks more tooling/support.

---

## Payment Terms

### Payout Schedule

**Monthly payouts with NET 30 terms** - industry standard payment schedule.

**Payment Schedule:**
- Revenue earned during calendar month (e.g., October 1-31)
- Invoice issued on 1st of following month (e.g., November 1)
- Payment due NET 30 (30 days after invoice date)
- Payment processed and issued by due date
- Funds arrive 2-5 business days after processing

**Example:**
```
Oct 1-31:        Revenue earned
Nov 1:           Invoice issued
Nov 30:          Payment due (NET 30)
Dec 2-5:         Payment received in your account
```

### Minimum Payout

**€100 minimum threshold** - industry standard to cover processing costs. Earnings below threshold roll over to next month.

### Payment Methods

- **Bank Transfer (SEPA)**: Free, 1-2 business days (Europe)
- **Wire Transfer (SWIFT)**: Free, 3-5 business days (International)
- **PayPal**: Available, 2.9% + $0.30 fee applies

### Currency

- **Primary**: EUR (Euro)
- **Reporting**: Revenue shown in your local currency for convenience
- **Exchange**: ECB (European Central Bank) daily rates

---

## What's Included By Tier

| Capability | Starter | Growth | Scale | Enterprise |
|------------|---------|--------|-------|------------|
| SDK coverage (Android, iOS, Unity, Web, TV) | ✅ | ✅ | ✅ | ✅ |
| Apps per org | Up to 5 | Unlimited | Unlimited | Unlimited |
| Core analytics & debugger | ✅ | ✅ | ✅ | ✅ |
| Adapter/SLO observability | — | ✅ | ✅ | ✅ |
| Migration Studio | — | ✅ | ✅ | ✅ |
| Signed logs & reproducible auctions | ✅ | ✅ | ✅ | ✅ |
| Fraud/quality ML (shadow) | — | — | ✅ (early access) | ✅ |
| Support SLAs | Community/best effort | Email + Slack (business hours) | Priority (same-day) | Contractual 24/7 |
| Custom dashboards/export | — | — | ✅ | ✅ |
| Dedicated TAM / QBRs | — | — | — | ✅ |

---

## Getting Started

1. [Sign up for free](https://apexmediation.bel-consulting.ee/signup) – no credit card required.
2. [Integrate the SDK](/docs/getting-started/quickstart) – typically under 10 minutes per platform.
3. Point your adapters at ApexMediation, verify Migration Studio mappings, and go live with full transparency.

Questions? Email sales@bel-consulting.ee or [schedule a demo](https://apexmediation.bel-consulting.ee/demo).

---

## Comparison Snapshot

| Feature | ApexMediation (BYO) | Legacy Network A | Legacy Network B |
|---------|---------------------|------------------|------------------|
| Platform fee | 0–2.5% (banded) | ~30% opaque take | 25–35% cliff |
| SDKs required | 1 (ours) + your BYO adapters | 5–10 | 5–10 |
| Transparency | Signed logs, Migration Studio, debugger | Limited | Limited |
| Support | Slack/email + dedicated channel on upper tiers | Ticket queues | Ticket queues |
| Payment terms | NET 30 | NET 60 | NET 60 |

Bottom line: we monetize the control plane—not your demand. You keep your accounts, pay only when you earn, and unlock better tooling as you scale.

---

## FAQs

### When do I start paying?

- Starter tier is free forever.
- Growth, Scale, and Enterprise platform fees apply only once your mediated revenue crosses their thresholds. Charges show up on your monthly invoice (NET 30) alongside usage details.

### Are there any hidden fees?

**No.** The only costs are:
- The platform fee percentage for your tier (0–2.5% or your negotiated enterprise rate)
- Optional add-ons you explicitly enable
- Payment method fees (only if using PayPal)

### Can I test before committing?

**Yes!** Sign up free, integrate the SDK, and test with live traffic. If you're not happy, remove the SDK - no contracts, no cancellation fees.

### What if I have both mobile and CTV traffic?

All channels count toward the same tier. We break out CTV/web video vs. mobile revenue in the dashboard, but the platform fee is applied to the total mediated revenue for the month unless you enable a specific add-on.

### Do you offer discounts for non-profits?

Yes! Non-profit organizations and educational institutions qualify for **50% off** the platform fee.

**Contact**: support@bel-consulting.ee with proof of non-profit status.

---

**Last Updated**: 2025-11-24  
**Pricing effective**: 2025-11-24  
**Subject to change**: We'll notify you 30 days before any price changes
