# Production Readiness Checklist

**ApexMediation Platform Launch Preparation**  
**Target Launch Date:** 2025-12-01  
**Status:** Pre-Launch

---

## Infrastructure Setup

### 1. Core Infrastructure (DigitalOcean-centric)

#### 1.1 Compute — Main App Droplet
- [ ] Create DigitalOcean account
- [ ] Create droplet `apex-core-1`
  - Type: Basic Regular or Premium (AMD/Intel)
  - Size: 2 vCPU / 4 GB RAM / 80 GB SSD (≈ $24/mo)
  - OS: Ubuntu LTS (22.04+)
  - Region: closest to publishers (e.g., FRA/AMS/NYC)
- [ ] Base server hardening
  - [ ] Create non-root user; disable password SSH; key auth only
  - [ ] Enable UFW: allow 22, 80, 443; deny others
  - [ ] Install fail2ban
  - [ ] Enable unattended-upgrades (security updates)
- [ ] Runtime setup (Docker)
  - [ ] Install Docker and docker-compose
  - [ ] Define `docker-compose.yml` with services: `api`, `console`, `redis`, `nginx`
  - [ ] Expose only Nginx on 80/443; keep app containers internal
- [ ] App networking and routing
  - [ ] Configure Nginx: 
    - `api.apexmediation.com` → backend API
    - `console.apexmediation.com` → frontend console
    - reserve `status.apexmediation.com`

#### 1.2 Database — Managed PostgreSQL (DigitalOcean)
- [ ] Create DigitalOcean Managed PostgreSQL cluster
  - Size: smallest Basic/Dev plan (≈ $15/mo)
  - Region: same as droplet
  - Storage: 10–20 GB
- [ ] Security & access
  - [ ] Restrict DB access to droplet private IP + optional admin IP
  - [ ] Enforce SSL connections from apps
- [ ] Roles
  - [ ] Create roles: `apex_app` (limited), `apex_admin` (migrations)
  - [ ] Store credentials in env vars + encrypted secrets (DO secrets/1Password)
- [ ] Schema & migrations
  - [ ] Port and run existing migrations (001–008+) against managed Postgres
  - [ ] Configure migration tool in CI (`deploy:migrations` one-command)
  - [ ] Verify tables, indices (hot columns), FKs/constraints
- [ ] Backups & retention
  - [ ] Enable automated daily backups (DO setting)
  - [ ] Test PITR by restoring to staging and verify schema/data
  - [ ] Document RPO (24h) and RTO (1–4h) targets
- [ ] Early analytics in Postgres
  - [ ] Create aggregated tables: `daily_app_metrics`, `daily_network_metrics`

#### 1.3 Cache — Redis (Self-Hosted on Droplet)
- [ ] Install Redis (Docker `redis:6-alpine` or APT)
- [ ] Bind to 127.0.0.1 or Docker network only (no public exposure)
- [ ] Configure:
  - [ ] Max memory (e.g., 512 MB)
  - [ ] Eviction policy `allkeys-lru`
  - [ ] Authentication (`requirepass`)
  - [ ] Persistence: AOF or RDB based on needs
- [ ] Use cases: rate limiting, idempotency keys, short-lived feature flags

#### 1.4 Object Storage & Backups
- [ ] Choose storage target:
  - Option A: DigitalOcean Spaces (e.g., `apex-prod-objects`) (~$5/mo)
  - Option B: Backblaze B2 (~$5/mo)
- [ ] Configure:
  - [ ] Private by default; signed URLs for downloads
  - [ ] Lifecycle rules for intermediate artifacts (30–90 days)
  - [ ] Weekly/monthly DB exports to chosen bucket (encrypted)
  - [ ] Verify restore path into a fresh DB in staging

#### 1.5 Budget Check (est.)
- Droplet 2 vCPU / 4GB: ~$24
- Managed Postgres basic: ~$15
- Spaces or B2: ~$5
- Misc (egress, DNS, backups): $3–5
→ Total: ~$44–49/month (≤ $50 target)

---

## Monitoring & Observability

### 2.1 Basic Host & App Monitoring
- [ ] Enable DigitalOcean Monitoring for `apex-core-1` (CPU, RAM, Disk, Network)
- [ ] Configure alerts:
  - [ ] CPU > 80% for 5 mins
  - [ ] Memory > 80% for 5 mins
  - [ ] Disk > 80% usage
  - [ ] Droplet unreachable

### 2.1.b Optional Grafana Stack (on droplet)
- [ ] Run Prometheus + Grafana in Docker (low retention 7–30 days)
- [ ] Scrape node exporter + app `/metrics`
- [ ] Dashboards: system, API p95/error rate/QPS, business metrics
- [ ] Protect Grafana with auth + IP restriction/VPN

### 2.2 Application Logging
- [ ] Standardize JSON structured logs (timestamp, level, service, request_id, user_id, app_id, path, latency_ms, error_code)
- [ ] Stream to file + DO console; enable logrotate
- [ ] Optional: add Loki later if volume grows

### 2.3 Error Tracking
- [ ] Create Sentry account (free tier)
- [ ] Integrate Sentry in backend API and Console
- [ ] Configure release/environment tags and basic PII sanitization
- [ ] SDK crash reporting: Firebase Crashlytics for Android/iOS
- [ ] Test error capture and alerting

### 2.4 Status Page
- [ ] Use Upptime or hosted (UptimeRobot/Better Stack)
- [ ] Monitor:
  - [ ] https://api.apexmediation.com/health
  - [ ] https://console.apexmediation.com/
- [ ] Public status page: CNAME `status.apexmediation.com` → service
- [ ] Simulate outage: stop API and confirm red status + notification

### 2.5 Alerting (Solo-Founder Friendly)
- [ ] Choose PagerDuty Free, Better Stack alerts, or email/SMS
- [ ] Critical alerts: API health down, DB connectivity loss, error rate > X% for Y mins
- [ ] Warning alerts: high latency, queue/backlog growth
- [ ] Escalation policy: you only (email + SMS)
- [ ] Trigger test alert and confirm delivery

---

## Payment & Billing

### Billing Policy Snapshot
- [ ] `/api/v1/billing/policy` returns the canonical Stripe-first policy (source of truth: `backend/src/config/billingPolicy.ts`).
- [ ] Cache bust instructions documented for console/docs consumers (see `docs/Customer-Facing/Compliance/Invoicing-Payments.md`).
- [ ] Stripe+Wise fallback wording in policy response matches customer-facing docs and console banners.
- [ ] Policy `version`/`updatedAt` match `stripe-mandatory-2025-11` snapshot and `docs/Internal/Deployment/BILLING_POLICY_ROLLOUT.md` status table.
- [ ] Console `/billing/settings` page renders Starter + autopay messaging directly from the snapshot (see `npm run test -- billing/settings` for evidence).
- [ ] Website pricing page + docs (`pricing.md`, `Website signup`) mirror Starter cap + autopay rails copy pulled from policy to avoid drift.

### Stripe  
See `docs/Internal/Deployment/STRIPE_COLLECTION_RUNBOOK.md` for the command-by-command runbook and evidence expectations.
- [ ] Create Stripe account
- [ ] Complete identity verification (KYC)
- [ ] Configure Estonian tax settings (VAT registration)
- [ ] Create products for BYO platform tiers:
  - [ ] Starter: $0 platform fee (free SKU for <$10k/mo revenue)
  - [ ] Growth: 2.5% usage-based fee on $10k–$100k mediated revenue
  - [ ] Scale: 2.0% usage-based fee on $100k–$500k mediated revenue
  - [ ] Enterprise: Custom rate (1.0–1.5%) + minimum
- [ ] Configure metered billing on `mediated_revenue_usd`
- [ ] Setup webhooks (invoice.payment_failed, invoice.payment_succeeded)
- [ ] Configure Customer Portal (self-service)
- [ ] Test payment flow (test mode)
- [ ] Enable live mode
- [x] Verify default SEPA instructions (Wise Europe SA IBAN + reference block) — `docs/Customer-Facing/Compliance/Invoicing-Payments.md` §Payment Methods (2025-11-24)
- [x] Verify default ACH instructions (Wise US / Community Federal Savings Bank) — `docs/Customer-Facing/Compliance/Invoicing-Payments.md` §Payment Methods (2025-11-24)
- [x] (Optional) Enable SEB account for customers that require local rails — documented under same section for procurement cases
- [x] Document secondary rails (Wise link, Stripe card, PayPal) in Console/docs — `pricing.md` + `Invoicing-Payments.md` refreshed 2025-11-24
- [x] Billing artifacts (pricing, invoicing guide, FAQ) reviewed for NET 30 + Wise defaults — 2025-11-24

### Starter → Autopay Enforcement QA
- [ ] Backend `starterExperience` cap enforced: Starter stays free with no payment method until $10k/app/month, upgrade triggers flip `requires_payment_method` flag in API.
- [ ] Autopay rails (`card`, `ach`, `sepa`) surface as `autopayEligible: true`; enterprise-only rails documented as manual exceptions.
- [ ] Console `/billing/settings` differentiates Starter vs paid tiers (no-card reassurance vs warning) and shows the autopay info card with notification copy.
- [ ] Website signup + docs FAQ reiterate “Starter stays free / autopay after upgrade” promise with same numbers + wording (reference commit hash in rollout doc).
- [ ] Billing notifications (pre-charge + charge receipts) templated to match `billingPolicy.billingCycle.notifications` content, stored in Resend templates.
- [ ] QA evidence captured in `docs/Internal/Deployment/BILLING_POLICY_ROLLOUT.md` (screenshots, policy JSON, console UI) before sign-off.
    - [ ] Website pricing + signup screenshots reflecting Starter free cap and autopay rails (blocked: capture manually after latest deploy).
      - Use `npm run dev` (local) or the staging deploy, zoom 100%, capture: (1) Pricing grid showing Starter 0% + autopay copy; (2) Signup policy callout + settlement rail instructions.
      - Drop PNGs into `docs/Internal/QA/billing-policy/` and link them in `docs/Internal/Deployment/BILLING_POLICY_ROLLOUT.md` once ready.

### Invoice → Payment Dry-Run
- [ ] Generate a Stripe test customer and usage event (see Runbook §5)
- [ ] Finalize invoice in test mode and confirm webhook updates local status to `paid`
- [ ] Download PDF/email to verify Wise SEPA + ACH wiring blocks render correctly
- [ ] Record screenshots/evidence in `docs/Internal/QA/stripe-dry-run/`
- [ ] Repeat in live mode with €0 invoice once Stripe is enabled

### Email (Resend.com)
- [ ] Create Resend account (free 3K emails/month)
- [ ] Verify domain (apexmediation.com)
- [ ] Configure DNS records (SPF, DKIM, DMARC)
- [ ] Test email delivery (welcome, trial, payment, usage)
- [ ] Monitor deliverability rate (target: >98%)

---

## Estonian Compliance

### E-Tax Board (e-MTA) Integration
- [ ] Register with Estonian Tax and Customs Board
- [ ] Obtain e-MTA API credentials
- [ ] Configure automated quarterly VAT reports
- [ ] Test VAT report generation and submission
- [ ] Setup reminders (1 week before deadline)

### E-Business Register
- [ ] Register Bel Consulting OÜ (if not already)
- [ ] Configure annual report automation
- [ ] Test report generation (balance sheet, income statement)
- [ ] Setup submission reminder (April 30 deadline)

### Document Retention
- [ ] Configure Spaces/B2 lifecycle + retention (7-year for invoices/docs)
- [ ] Test document upload and retrieval
- [ ] Verify immutability or effective retention controls

---

## Sales Automation

### Cron Jobs
- [ ] Run cron service as part of `docker-compose` on `apex-core-1`
- [ ] Verify cron schedule:
  - [ ] Every minute: Email queue processing
  - [ ] Hourly: Usage limit checks
  - [ ] Daily 2 AM: Stripe usage sync
  - [ ] Daily 3 AM: Dunning retries
  - [ ] Daily 9 AM: Trial ending reminders
  - [ ] Monthly 1st: Usage summaries
- [ ] Monitor cron execution (logs, errors, duration)
- [ ] Setup alerts for failed cron jobs

### Email Templates
- [ ] Review all 10+ email templates (design, copy, CTAs)
- [ ] Test with real email addresses
- [ ] Verify links (docs, console, support)
- [ ] Check mobile responsiveness
- [ ] A/B test subject lines (if >100 customers)

### Database Migrations
- [ ] Run migration 008_sales_automation.sql
- [ ] Verify tables: usage_records, usage_alerts, dunning_attempts, events, email_log
- [ ] Check indexes for performance
- [ ] Test queries (usage aggregation, dunning status, email deduplication)

---

## SDK Release Automation

### GitHub Actions
- [ ] Verify workflow files:
  - [ ] .github/workflows/sdk-release.yml
  - [ ] .github/workflows/compatibility-testing.yml
  - [ ] .github/workflows/docs-deployment.yml
- [ ] Configure secrets:
  - [ ] COCOAPODS_TRUNK_TOKEN (iOS)
  - [ ] OSSRH_USERNAME, OSSRH_PASSWORD, GPG_PRIVATE_KEY (Android)
  - [ ] NPM_TOKEN (Unity)
  - [ ] CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (Docs)
  - [ ] DATABASE_URL, RESEND_API_KEY (Notifications)
- [ ] Test workflow with pre-release tag (v0.1.0-beta.1)
- [ ] Verify: build → test → publish → notify → deploy docs

### Package Managers
- [ ] **CocoaPods (iOS):**
  - [ ] Register with pod trunk (`pod trunk register`)
  - [ ] Add co-maintainers if needed
  - [ ] Test: `pod trunk push ApexMediation.podspec --allow-warnings`
- [ ] **Maven Central (Android):**
  - [ ] Register with Sonatype OSSRH
  - [ ] Create GPG key for signing
  - [ ] Configure gradle.properties
  - [ ] Test: `./gradlew publishToMavenCentral`
- [ ] **NPM (Unity):**
  - [ ] Create NPM account
  - [ ] Generate access token
  - [ ] Test: `npm publish --access public`

### Documentation Deployment
- [ ] Create Cloudflare Pages project (apexmediation-docs)
- [ ] Configure custom domain (docs.apexmediation.com)
- [ ] Test TypeDoc, Jazzy, Dokka, JSDoc generation
- [ ] Verify version switcher functionality
- [ ] Setup Algolia DocSearch (optional, for search)

---

## Security

### Secrets Management
- [ ] Choose: Infisical self-hosted or Doppler ($5/mo)
- [ ] Migrate all secrets from .env to secrets manager
- [ ] Configure access policies (least privilege)
- [ ] Setup secret rotation (monthly for sensitive keys)
- [ ] Test secret injection into containers

### SSL/TLS
- [ ] Verify HTTPS on all domains (api, console, docs, status)
- [ ] Check TLS 1.3 support
- [ ] Scan with SSL Labs (target: A+ rating)
- [ ] Configure HSTS headers

### Dependency Scanning
- [ ] Enable Dependabot on GitHub
- [ ] Configure automated PRs for security updates
- [ ] Setup npm audit in CI/CD
- [ ] Run Trivy scan on Docker images

### Penetration Testing
- [ ] Schedule penetration test (hire security firm or use BugCrowd)
- [ ] Fix critical and high vulnerabilities
- [ ] Re-test after fixes
- [ ] Document findings and remediations

---

## Customer Onboarding

### Console (Customer Dashboard)
- [ ] Deploy console frontend to Cloudflare Pages
- [ ] Configure custom domain (console.apexmediation.com)
- [ ] Test signup flow (email verification, password, company name)
- [ ] Test login (JWT authentication, refresh tokens)
- [ ] Verify dashboard (usage charts, API keys, billing, invoices)
- [ ] Test API key generation and revocation
- [ ] Check mobile responsiveness

### Documentation
- [ ] Review all docs for accuracy (iOS, Android, Unity guides)
- [ ] Test code examples (copy-paste into Xcode, Android Studio, Unity)
- [ ] Verify links (no 404s)
- [ ] Check SEO (meta tags, sitemap, robots.txt)
- [ ] Submit to Algolia DocSearch (if using)
- [x] Pricing + invoicing docs updated to BYO tier language (website `[...slug]`, `docs/Customer-Facing/Compliance/Invoicing-Payments.md`) – 2025-11-24

### Support Channels
- [ ] Create Discord server (discord.gg/apexmediation)
- [ ] Setup channels (#general, #support, #sdk-help, #announcements)
- [ ] Enable GitHub Discussions on repository
- [ ] Configure support email (support@apexmediation.com)
- [ ] Create FAQ (common questions, troubleshooting)
- [ ] Train AI support bot (GPT-4o-mini with FAQ context)

---

## Marketing & Launch

### Website
- [ ] Deploy landing page to Cloudflare Pages (apexmediation.com)
- [ ] Content:
  - [ ] Hero section (OTA-proof, transparent bidding, NET30 invoicing)
  - [ ] Features comparison (Unity vs ApexMediation)
  - [ ] Pricing section (Starter 0%, Growth 2.5%, Scale 2.0%, Enterprise 1.0–1.5% + minimum)
  - [ ] Testimonials (early adopters)
  - [ ] Integration guides preview
  - [ ] Call-to-action (Sign up, Request demo)
- [x] BYO pricing copy verified across marketing + docs (Starter/Growth/Scale/Enterprise) — 2025-11-24 BYO audit
- [ ] SEO optimization (keywords: "unity mediation alternative", "ad mediation SDK")
- [ ] Google Analytics or self-hosted Plausible/Umami

### Launch Announcement
- [ ] Write blog post: "Introducing ApexMediation: Unity-Rival Ad Mediation"
- [ ] Post to:
  - [ ] Reddit (/r/gamedev, /r/Unity3D, /r/androiddev, /r/iOSProgramming)
  - [ ] Hacker News (Show HN: ApexMediation - OTA-proof ad mediation)
  - [ ] Product Hunt (schedule launch day)
  - [ ] Twitter/X (threaded announcement)
  - [ ] LinkedIn (professional network)
  - [ ] Indie Hackers (entrepreneurship community)
- [ ] Reach out to game dev influencers (YouTube, Twitter)
- [ ] Submit to directories (AlternativeTo, Slant, G2)

### Email Marketing
- [ ] Setup Listmonk self-hosted (free)
- [ ] Create mailing list (early access, launch announcements)
- [ ] Import signups from landing page
- [ ] Draft welcome sequence:
  - [ ] Email 1: Welcome, what to expect
  - [ ] Email 2: Integration guide (choose platform)
  - [ ] Email 3: Best practices (ad placements, optimization)
  - [ ] Email 4: Case study (early adopter success)
  - [ ] Email 5: Referral program (invite colleagues)

---

## Legal

### Terms & Privacy
- [ ] Draft Terms of Service (use standard SaaS template)
- [ ] Draft Privacy Policy (GDPR compliant)
- [ ] Draft Data Processing Agreement (for Enterprise customers)
- [ ] Review with lawyer (optional, ~$1,000-2,000)
- [ ] Publish on website with acceptance tracking
- [ ] Configure cookie consent (OneTrust or similar)

### Insurance
- [ ] Cyber liability insurance (recommended, ~$1,000-2,000/year)
- [ ] General liability insurance (optional for solo operator)

---

## Launch Day Checklist (Day 0)

### Pre-Launch (T-1 day)
- [ ] Final smoke tests (all systems green)
- [ ] Database backups verified
- [ ] Rollback plan documented
- [ ] PagerDuty on-call configured
- [ ] Sleep well

### Launch Sequence (10 AM UTC)
- [ ] 10:00 - Enable live mode (Stripe, all services)
- [ ] 10:05 - Deploy production build
- [ ] 10:10 - Verify health checks
- [ ] 10:15 - Test end-to-end flow (signup → API key → usage tracking)
- [ ] 10:30 - Publish launch announcement (blog, social media)
- [ ] 10:45 - Monitor logs and metrics (errors, latency, signups)
- [ ] 11:00 - First customer signup? 🎉

### Post-Launch (T+1 hour)
- [ ] Monitor for 1 hour (errors, crashes, performance)
- [ ] Respond to support questions (Discord, email)
- [ ] Track signups and conversions
- [ ] Celebrate! 🍾

---

## Week 1 Goals

- [ ] **10-50 signups** (conservative target)
- [ ] **5-10 active customers** (completed onboarding, API calls)
- [ ] **Zero critical bugs** (no service outages, no data loss)
- [ ] **<1% error rate** (API responses)
- [ ] **99.95% uptime** (4.5 minutes downtime allowed per week)
- [ ] **<5 hours support** (mostly automated)

---

## Tools & Access

### Required Accounts
- [ ] DigitalOcean (droplet, managed Postgres, Spaces)
- [ ] Backblaze (B2 backups) — optional if not using Spaces for backups
- [ ] Stripe (payments)
- [ ] Resend.com (emails)
- [ ] Sentry (error tracking)
- [ ] UptimeRobot/Better Stack or GitHub (Upptime)
- [ ] PagerDuty (alerting) — optional
- [ ] GitHub (code, CI/CD)
- [ ] CocoaPods (iOS distribution)
- [ ] Sonatype OSSRH (Android distribution)
- [ ] NPM (Unity distribution)

### Required Credentials
- [ ] DATABASE_URL (DO Managed Postgres; SSL required)
- [ ] REDIS_URL (redis://:password@127.0.0.1:6379/0)
- [ ] SPACES_ACCESS_KEY_ID / SPACES_SECRET_ACCESS_KEY (or B2 key)
- [ ] SPACES_ENDPOINT/BUCKET (or B2 bucket)
- [ ] STRIPE_SECRET_KEY (Stripe)
- [ ] RESEND_API_KEY (Resend.com)
- [ ] SENTRY_DSN (error tracking)
- [ ] STATUS_PAGE_TOKEN or service API key (if applicable)
- [ ] PAGERDUTY_API_KEY (alerts) — optional
- [ ] COCOAPODS_TRUNK_TOKEN (iOS)
- [ ] OSSRH_USERNAME, OSSRH_PASSWORD (Android)
- [ ] NPM_TOKEN (Unity)
- [ ] JWT_SECRET (authentication)
- [ ] ENCRYPTION_KEY (sensitive data)

---

## Success Criteria

### Technical Success
- ✅ All systems operational
- ✅ 99.95% uptime (Week 1)
- ✅ <500ms API response time (p95)
- ✅ <1% error rate
- ✅ Zero data loss
- ✅ Zero security incidents

### Business Success
- ✅ 10-50 signups (Week 1)
- ✅ 5-10 active customers (Week 1)
- ✅ 2 paying customers (break-even)
- ✅ <5 hours/week operations
- ✅ 90%+ support automation

### Customer Success
- ✅ <1 hour onboarding time
- ✅ Successful SDK integration (iOS, Android, or Unity)
- ✅ First ad impression served
- ✅ Accurate usage tracking
- ✅ First customer invoice issued and settled (Wise or Stripe)

---

**Checklist Status:** 0% Complete (Pre-Launch)  
**Target Completion:** November 15-30, 2025  
**Launch Date:** 2025-12-01

**Next Action:** Begin infrastructure setup (DigitalOcean droplet + Managed Postgres + Redis + Spaces/B2)
