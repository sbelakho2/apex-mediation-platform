# Invoicing & Payments Guide

_Last updated: 2025-11-18_  
_Owner: Finance / Billing Team_  
_Review Cycle: Quarterly or when payment terms change (next review: 2026-02-18)_  
_Status: Draft - SLA and late fee policy pending_

> **FIX-10 governance:** This guide documents current billing practices. For actual implementation status, see `docs/Internal/Deployment/PROJECT_STATUS.md` and `docs/Internal/Development/FIXES.md` (FIX-02 covers billing). Payment terms are subject to change; customers will be notified 30 days in advance of material changes.

Complete guide to payments, invoicing, and financial operations for ApexMediation customers.

## Table of Contents

1. [Payment Schedule](#payment-schedule)
2. [Revenue Sharing](#revenue-sharing)
3. [Invoicing Process](#invoicing-process)
4. [Payment Methods](#payment-methods)
5. [Tax Information](#tax-information)
6. [Minimum Payout](#minimum-payout)
7. [Currency & Exchange Rates](#currency--exchange-rates)
8. [Disputes & Adjustments](#disputes--adjustments)
9. [Financial Reporting](#financial-reporting)

---

## Payment Schedule

### Weekly Payouts

**ApexMediation pays weekly** - unlike competitors with monthly cycles or high minimums.

**Payment Schedule:**
```
Monday-Sunday:    Revenue earned
Following Friday: Payment issued
+2-5 business days: Payment received
```

**Example:**
```
Oct 28 - Nov 3: Earn $1,234.56
Nov 8 (Friday):  Payment issued
Nov 10-13:      Payment received in your account
```

### Payment Calendar

**Dashboard → Billing → Payment Calendar**

```
November 2025 Payment Schedule

┌─────────┬──────────────┬────────────┬────────────┐
│ Week    │ Earn Period  │ Pay Date   │ Amount     │
├─────────┼──────────────┼────────────┼────────────┤
│ Week 1  │ Oct 28-Nov 3 │ Nov 8      │ $1,234.56  │
│ Week 2  │ Nov 4-10     │ Nov 15     │ $1,156.78  │
│ Week 3  │ Nov 11-17    │ Nov 22     │ $1,289.34  │
│ Week 4  │ Nov 18-24    │ Nov 29     │ $1,345.67  │
│ Week 5  │ Nov 25-Dec 1 │ Dec 6      │ Pending    │
└─────────┴──────────────┴────────────┴────────────┘

Next Payment: 2025-11-15 ($1,156.78)
```

### Holiday Schedule

**Payments delayed by bank holidays:**
- Christmas: Dec 25-26
- New Year: Jan 1
- Easter: Variable (Good Friday, Easter Monday)
- Other: National holidays in your country

**Delayed payment:** Next business day

---

## Revenue Sharing

### Standard Plan (15%)

**ApexMediation fee:** 15% of ad revenue
**Your share:** 85% of ad revenue

**Example:**
```
Ad revenue:    $1,000.00
ApexMediation fee:  -$150.00 (15%)
Your payment:   $850.00 (85%)
```

### Premium Plan (12%)

**Requirements:**
- $10,000+ monthly revenue
- 500K+ monthly active users
- 6+ months with ApexMediation

**ApexMediation fee:** 12% of ad revenue
**Your share:** 88% of ad revenue

**Example:**
```
Ad revenue:    $10,000.00
ApexMediation fee:  -$1,200.00 (12%)
Your payment:   $8,800.00 (88%)

Savings vs Standard: $300/month
```

### Enterprise Plan (10%)

**Requirements:**
- $50,000+ monthly revenue
- 2M+ monthly active users
- 12+ months with ApexMediation
- Dedicated account manager

**ApexMediation fee:** 10% of ad revenue
**Your share:** 90% of ad revenue

**Example:**
```
Ad revenue:    $50,000.00
ApexMediation fee:  -$5,000.00 (10%)
Your payment:  $45,000.00 (90%)

Savings vs Standard: $2,500/month
Savings vs Premium: $1,000/month
```

### Upgrade Process

**Automatic upgrade:** When you meet criteria, we'll email you and upgrade your account.

**Manual request:** Contact sales@apexmediation.ee if you believe you qualify.

---

## Invoicing Process

### Automatic Invoices

**Every Friday:** Invoice generated automatically for previous week's revenue.

**Dashboard → Billing → Invoices**

```
Recent Invoices

┌────────────────┬──────────────┬────────────┬──────────┐
│ Invoice #      │ Period       │ Amount     │ Status   │
├────────────────┼──────────────┼────────────┼──────────┤
│ INV-2025-11-01 │ Oct 28-Nov 3 │ $1,234.56  │ Paid ✅  │
│ INV-2025-10-04 │ Oct 21-27    │ $1,156.78  │ Paid ✅  │
│ INV-2025-10-03 │ Oct 14-20    │ $1,089.45  │ Paid ✅  │
│ INV-2025-10-02 │ Oct 7-13     │ $945.67    │ Paid ✅  │
└────────────────┴──────────────┴────────────┴──────────┘
```

### Invoice Contents

**Invoice #INV-2025-11-01**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                   AD STACK
           Bel Consulting OÜ
       Reg: 16558645 | VAT: EE102569407
         Sepise 4-2, Tallinn, Estonia
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INVOICE

Invoice #:      INV-2025-11-01
Issue Date:     2025-11-08
Due Date:       2025-11-08 (Immediate)
Period:         October 28 - 2025-11-03

Bill To:
[Your Company Name]
[Your Company Address]
[VAT Number if applicable]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REVENUE BREAKDOWN

Ad Revenue (Gross):                    $1,452.42

By Network:
  Google AdMob:        $523.45
  Meta Audience:       $389.67
  Unity Ads:           $312.34
  AppLovin:            $156.78
  Others:              $70.18

By Ad Type:
  Interstitial:        $789.34
  Rewarded Video:      $556.78
  Banner:              $106.30

By Geography:
  United States:       $678.45
  Germany:             $234.56
  United Kingdom:      $189.23
  Canada:              $156.78
  Others:              $193.40

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CALCULATION

Gross Ad Revenue:                      $1,452.42
ApexMediation Service Fee (15%):            -$217.86
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Net Payment:                           $1,234.56
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VAT (if applicable):                   $0.00
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL DUE:                             $1,234.56
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Payment Status: PAID ✅
Payment Date: 2025-11-08
Payment Method: Bank Transfer
Transaction ID: TXN-ABC123DEF456

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Questions? billing@apexmediation.ee
Dashboard: https://console.apexmediation.ee/billing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Download Options

**Formats:**
- PDF (default)
- CSV (for accounting software)
- Excel (for manual processing)

**API:**
```bash
# Download invoice PDF
curl "https://api.apexmediation.ee/v1/invoices/INV-2025-11-01/download?format=pdf" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  > invoice.pdf

# Download invoice CSV
curl "https://api.apexmediation.ee/v1/invoices/INV-2025-11-01/download?format=csv" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  > invoice.csv
```

---

## Payment Methods

### Bank Transfer (SEPA)

**Recommended for:** European customers

**Details:**
```
Beneficiary: Bel Consulting OÜ
IBAN: EE987654321012345678
BIC/SWIFT: LHVBEE22
Bank: LHV Pank
Country: Estonia
```

**Timing:** 1-2 business days (SEPA Instant: same day)
**Fees:** Free (SEPA transfers)

### Wire Transfer (International)

**For:** Non-European customers

**Details:**
```
Beneficiary: Bel Consulting OÜ
Account: [Account Number]
SWIFT: LHVBEE22
Bank Address: LHV Pank, Tartu mnt 2, Tallinn, Estonia
Intermediary Bank: [If applicable]
```

**Timing:** 3-5 business days
**Fees:** $15-30 (varies by bank)

### PayPal

**For:** Small publishers, quick setup

**Details:**
- PayPal email: payments@apexmediation.ee
- Currency: USD, EUR, GBP

**Timing:** 1-2 business days
**Fees:** 2.9% + $0.30 per transaction (deducted from payment)

**Example:**
```
Net Payment:       $1,234.56
PayPal Fee:        -$36.13 (2.9% + $0.30)
You Receive:       $1,198.43
```

### Cryptocurrency (Coming Soon)

**Planned support:**
- Bitcoin (BTC)
- Ethereum (ETH)
- USDC (stablecoin)

**Benefits:**
- Lower fees (~1%)
- Faster settlement (minutes)
- Global accessibility

**Waitlist:** Contact billing@apexmediation.ee

---

## Tax Information

### VAT (Value Added Tax)

**EU customers with VAT number:**
- **Reverse charge** applies (you pay VAT in your country)
- Provide VAT number in Dashboard → Settings → Billing
- No VAT charged on invoice

**Example invoice (EU B2B):**
```
Net Payment:                $1,234.56
VAT (0% - Reverse Charge):  $0.00
TOTAL:                      $1,234.56

Note: Reverse charge - Article 196 EU VAT Directive
```

**EU customers without VAT number:**
- 20% Estonian VAT applied
- Appears on invoice

**Example invoice (EU B2C):**
```
Net Payment:                $1,234.56
VAT (20%):                  $246.91
TOTAL:                      $1,481.47
```

**Non-EU customers:**
- No VAT charged
- Provide company details for invoice

### Withholding Tax

**Some countries require withholding tax on payments to foreign companies.**

**Your responsibility:**
- Check local tax laws
- Withhold tax if required
- Remit to tax authority
- Provide certificate to ApexMediation

**Example (US withholding):**
```
Gross Payment:              $1,234.56
US Withholding (30%):       -$370.37
Net Transferred:            $864.19

[Provide Form 1042-S to ApexMediation]
```

**Our support:**
- We provide W-8BEN-E form (US)
- Tax residence certificate (Estonia)
- Contact billing@apexmediation.ee for tax forms

### Tax Reporting

**Dashboard → Billing → Tax Documents**

**Annual tax summary:**
```
2025 Tax Year Summary

Total Gross Revenue:        $63,456.78
Total ApexMediation Fees:        -$9,518.52
Total Net Payments:         $53,938.26

VAT Charged (if applicable): $0.00

Payments by Quarter:
  Q1: $12,345.67
  Q2: $14,567.89
  Q3: $13,234.56
  Q4: $13,790.14
```

**Export:** CSV, PDF

---

## Minimum Payout

### No Minimum!

**Unlike competitors:**
- Google AdMob: $100 minimum
- Meta Audience Network: $100 minimum
- Unity Ads: $100 minimum

**ApexMediation: $0 minimum** ✅

**We pay weekly regardless of amount.**

**Why?**
- Cash flow for small publishers
- No waiting months to reach threshold
- Fair and transparent

**Example:**
```
Week 1: Earn $12.34  → Paid Friday
Week 2: Earn $23.45  → Paid Friday
Week 3: Earn $45.67  → Paid Friday

No waiting for $100 threshold!
```

---

## Currency & Exchange Rates

### Primary Currency: USD

**All revenue reported in USD** (industry standard).

**Why USD?**
- Ad networks pay in USD
- Industry standard
- Simplifies comparison

### Payout Currency

**You choose payout currency:**
- USD
- EUR
- GBP
- Other (on request)

**Exchange rate:**
- **Mid-market rate** (no markup)
- ECB reference rate (updated daily)
- Rate locked at payment processing time

**Example:**
```
Revenue:           $1,234.56 USD
Exchange Rate:     1 USD = 0.92 EUR (2025-11-08)
Payout:            €1,135.79 EUR
```

**Dashboard → Settings → Billing → Payout Currency**

### Exchange Rate Transparency

**Dashboard → Billing → Exchange Rates**

```
Recent Exchange Rates

┌─────────────┬──────────┬──────────────┐
│ Date        │ USD/EUR  │ Source       │
├─────────────┼──────────┼──────────────┤
│ 2025-11-08 │ 0.9200   │ ECB          │
│ 2025-11-07 │ 0.9198   │ ECB          │
│ 2025-11-06 │ 0.9205   │ ECB          │
│ 2025-11-05 │ 0.9203   │ ECB          │
└─────────────┴──────────┴──────────────┘
```

**API:**
```bash
curl "https://api.apexmediation.ee/v1/billing/exchange-rates?date=2025-11-08" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Disputes & Adjustments

### Reporting Discrepancies

**If you notice a discrepancy:**

1. **Check Dashboard:** Dashboard → Analytics → Revenue (compare to invoice)
2. **Email billing@apexmediation.ee** with:
   - Invoice number
   - Expected amount
   - Actual amount
   - Explanation

**Example email:**
```
Subject: Invoice Discrepancy - INV-2025-11-01

Hi ApexMediation Billing Team,

I noticed a discrepancy in invoice INV-2025-11-01:

- Expected revenue: $1,500.00
- Invoiced revenue: $1,234.56
- Difference: -$265.44

According to my dashboard analytics, I had:
- 1,500,000 impressions
- $1.00 eCPM average
- Expected: $1,500

Can you investigate?

Thanks,
[Your Name]
```

### Response Time

**Initial response:** Within 24 hours
**Resolution:** Within 5 business days

### Common Reasons for Discrepancies

1. **Invalid Traffic Filtering**
   - We filter fraud/invalid clicks
   - Refunds from ad networks
   - Typically 1-3% of traffic

2. **Currency Exchange**
   - Some networks pay in EUR/GBP
   - Exchange rate fluctuations
   - Check "Revenue Breakdown" in invoice

3. **Revenue Timing**
   - Some networks report delayed
   - Previous week's adjustments
   - Check "Prior Period Adjustments"

4. **Chargebacks**
   - Advertiser disputes charge
   - Rare (<0.1%)
   - Detailed in invoice notes

### Adjustments

**If discrepancy confirmed:**

**Credit adjustment:**
```
Invoice #INV-2025-11-02

Net Payment:                $1,234.56
Prior Period Adjustment:    +$265.44
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL:                      $1,500.00
```

**Separate payment (large adjustment):**
- Issued within 5 business days
- Separate invoice generated
- Email notification

---

## Financial Reporting

### Revenue Dashboard

**Dashboard → Analytics → Revenue**

```
┌─────────────────────────────────────────────────┐
│  Revenue Overview                               │
├─────────────────────────────────────────────────┤
│  Today:           $45.67                        │
│  This Week:       $234.56                       │
│  This Month:      $4,567.89                     │
│  Last Month:      $4,234.56                     │
│  This Year:       $53,938.26                    │
└─────────────────────────────────────────────────┘

Revenue Trend (Last 30 Days)
  $200 ┤              ╭─╮
  $150 ┤         ╭───╮│ │╭─╮
  $100 ┤    ╭───╮│   ╰╯ ╰╯ ╰╮
   $50 ┤╭───╯   ╰╯           ╰─╮
       └┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─
```

### Revenue Breakdown

**By Network:**
```
┌─────────────────┬────────────┬──────────┐
│ Network         │ Revenue    │ %        │
├─────────────────┼────────────┼──────────┤
│ Google AdMob    │ $15,234.56 │ 35.7%    │
│ Meta Audience   │ $12,345.67 │ 28.9%    │
│ Unity Ads       │ $9,876.54  │ 23.1%    │
│ AppLovin        │ $4,567.89  │ 10.7%    │
│ Others          │ $678.90    │ 1.6%     │
└─────────────────┴────────────┴──────────┘
```

**By Geography:**
```
┌─────────────────┬────────────┬──────────┐
│ Country         │ Revenue    │ %        │
├─────────────────┼────────────┼──────────┤
│ United States   │ $23,456.78 │ 54.9%    │
│ Germany         │ $6,789.01  │ 15.9%    │
│ United Kingdom  │ $5,678.90  │ 13.3%    │
│ Canada          │ $3,456.78  │ 8.1%     │
│ Others          │ $3,345.79  │ 7.8%     │
└─────────────────┴────────────┴──────────┘
```

**By Ad Type:**
```
┌─────────────────┬────────────┬──────────┐
│ Ad Type         │ Revenue    │ %        │
├─────────────────┼────────────┼──────────┤
│ Interstitial    │ $23,456.78 │ 54.9%    │
│ Rewarded Video  │ $15,678.90 │ 36.7%    │
│ Banner          │ $3,567.89  │ 8.4%     │
└─────────────────┴────────────┴──────────┘
```

### Export Reports

**Dashboard → Billing → Export Reports**

**Pre-configured reports:**
- Weekly Revenue Summary (CSV)
- Monthly Invoice Summary (Excel)
- Annual Tax Summary (PDF)
- Custom Date Range (Choose format)

**API:**
```bash
curl "https://api.apexmediation.ee/v1/billing/reports?period=30d&format=csv" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  > revenue_report.csv
```

### Accounting Software Integration

**Supported integrations:**
- QuickBooks (via Zapier)
- Xero (via Zapier)
- Sage (CSV import)
- FreshBooks (CSV import)
- Custom (API)

**Setup:** Dashboard → Settings → Integrations

---

## FAQ

### When do I get paid?

**Every Friday** for previous week's revenue (Monday-Sunday). Payment arrives in your account 2-5 business days later.

### Is there a minimum payout?

**No!** We pay weekly regardless of amount (even $1).

### Can I change my payment method?

**Yes.** Dashboard → Settings → Billing → Payment Method. Changes apply to next payment.

### What if I don't receive payment?

Email billing@apexmediation.ee with:
- Invoice number
- Expected payment date
- Your bank details

We'll investigate and resend if needed.

### Can I get an advance payment?

**No.** We pay after revenue is earned and confirmed by ad networks.

### Do you charge any fees?

**No!** Our revenue share (15%/12%/10%) is all-inclusive. No setup fees, no monthly fees, no hidden fees.

Exception: PayPal transactions have PayPal's standard fees (2.9% + $0.30).

### Can I get invoices for previous years?

**Yes.** Dashboard → Billing → Invoices → Filter by year. Download anytime.

### What happens if I close my account?

**Final payment issued** within 30 days of account closure (waiting for final network reports). All data deleted per GDPR.

---

## Support

**Email:** billing@apexmediation.ee
**Dashboard:** https://console.apexmediation.ee/billing
**Phone:** +372 5XXX XXXX (Mon-Fri, 9am-5pm EET)

**Response Times:**
- Payment issues: <24 hours
- Invoice questions: <24 hours
- Tax questions: <48 hours
- General inquiries: <48 hours
