# Production Readiness Checklist

**ApexMediation Platform Launch Preparation**  
**Target Launch Date:** December 1, 2025  
**Status:** Pre-Launch

---

## Infrastructure Setup

### Fly.io Configuration
- [ ] Create Fly.io account
- [ ] Deploy 2 VMs (shared CPU, 256MB RAM each) → $14/month
- [ ] Configure auto-scaling rules (>100 req/s scale up, <20 req/s scale down)
- [ ] Setup custom domain (api.apexmediation.com)
- [ ] Configure SSL/TLS certificates (automatic with Fly.io)
- [ ] Test health checks and automatic restart

### Database (Supabase)
- [ ] Create Supabase Pro account → $25/month
- [ ] Provision PostgreSQL database (8GB storage, connection pooling)
- [ ] Run all migrations (001-008)
- [ ] Configure daily backups to Backblaze B2
- [ ] Setup read replicas for analytics (if needed)
- [ ] Test connection from Fly.io VMs

### Redis Cache (Upstash)
- [ ] Create Upstash account → $10/month
- [ ] Provision Redis instance (1GB, 10K commands/day)
- [ ] Configure connection from backend
- [ ] Test caching layer performance

### ClickHouse (Analytics)
- [ ] Choose: ClickHouse Cloud ($50-100/mo) or self-hosted on Fly.io ($20/mo)
- [ ] Create analytics database
- [ ] Setup 1-year TTL for usage_events table
- [ ] Configure connection from backend
- [ ] Test query performance (<100ms for aggregations)

### Storage (Cloudflare R2 + Backblaze B2)
- [ ] Create Cloudflare R2 bucket → ~$5/month
- [ ] Create Backblaze B2 bucket for backups → ~$5/month
- [ ] Configure 7-year retention for invoices and documents
- [ ] Setup automated backup cron job
- [ ] Test file upload/download

---

## Monitoring & Observability

### Self-Hosted Grafana Stack
- [ ] Deploy Grafana + Prometheus + Loki on Fly.io VM → $8/month
- [ ] Configure metrics collection from backend
- [ ] Create dashboards:
  - [ ] System health (CPU, memory, disk, network)
  - [ ] API performance (response time, error rate, throughput)
  - [ ] Business metrics (MRR, customers, usage)
  - [ ] Sales automation (dunning, email delivery, usage alerts)
  - [ ] SDK releases (adoption rate, time to release)
- [ ] Setup log aggregation (Loki)
- [ ] Configure log retention (30 days)

### Error Tracking
- [ ] Choose: Sentry free tier (5K events/month) or self-hosted GlitchTip
- [ ] Configure error reporting from backend
- [ ] Configure SDK crash reporting (Firebase Crashlytics for iOS/Android)
- [ ] Test error capture and alerting

### Status Page (Upptime)
- [ ] Fork Upptime template to GitHub
- [ ] Configure endpoints to monitor (api, console, docs)
- [ ] Setup GitHub Pages deployment → status.apexmediation.com
- [ ] Configure incident templates
- [ ] Test automated incident detection

### Alerting (PagerDuty)
- [ ] Create PagerDuty account (free tier or $25/mo)
- [ ] Configure integration with Grafana
- [ ] Setup escalation policies (solo: email + SMS)
- [ ] Define alert rules:
  - [ ] Critical: Service down, database unavailable, payment failure
  - [ ] Warning: High error rate, slow response time, failed cron job
- [ ] Test alert delivery (email, SMS, push notification)

---

## Payment & Billing

### Stripe
- [ ] Create Stripe account
- [ ] Complete identity verification (KYC)
- [ ] Configure Estonian tax settings (VAT registration)
- [ ] Create products and pricing:
  - [ ] Indie: $99/month, 1M impressions, 100K API calls
  - [ ] Studio: $499/month, 10M impressions, 1M API calls
  - [ ] Enterprise: Custom, 100M+ impressions, 10M+ API calls
- [ ] Configure metered billing for overages
- [ ] Setup webhooks (invoice.payment_failed, invoice.payment_succeeded)
- [ ] Configure Customer Portal (self-service)
- [ ] Test payment flow (test mode)
- [ ] Enable live mode

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
- [ ] Configure S3 WORM (Write-Once-Read-Many) for invoices
- [ ] Setup 7-year retention policy (Estonian Accounting Act § 13)
- [ ] Test document upload and retrieval
- [ ] Verify immutability (can't delete or modify)

---

## Sales Automation

### Cron Jobs
- [ ] Deploy cron job container on Fly.io
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
  - [ ] Hero section (OTA-proof, transparent bidding, weekly payouts)
  - [ ] Features comparison (Unity vs ApexMediation)
  - [ ] Pricing table (Indie, Studio, Enterprise)
  - [ ] Testimonials (early adopters)
  - [ ] Integration guides preview
  - [ ] Call-to-action (Sign up, Request demo)
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
- [ ] Fly.io (hosting)
- [ ] Supabase (database)
- [ ] Upstash (Redis)
- [ ] ClickHouse Cloud (analytics) or self-hosted
- [ ] Cloudflare (R2 storage, Pages, DNS)
- [ ] Backblaze (B2 backups)
- [ ] Stripe (payments)
- [ ] Resend.com (emails)
- [ ] PagerDuty (alerting)
- [ ] GitHub (code, CI/CD)
- [ ] CocoaPods (iOS distribution)
- [ ] Sonatype OSSRH (Android distribution)
- [ ] NPM (Unity distribution)

### Required Credentials
- [ ] DATABASE_URL (Supabase PostgreSQL)
- [ ] REDIS_URL (Upstash)
- [ ] CLICKHOUSE_URL (ClickHouse)
- [ ] STRIPE_SECRET_KEY (Stripe)
- [ ] RESEND_API_KEY (Resend.com)
- [ ] CLOUDFLARE_API_TOKEN (R2, Pages)
- [ ] PAGERDUTY_API_KEY (alerts)
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
- ✅ First payout processed

---

**Checklist Status:** 0% Complete (Pre-Launch)  
**Target Completion:** November 15-30, 2025  
**Launch Date:** December 1, 2025

**Next Action:** Begin infrastructure setup (Fly.io, Supabase, Stripe)
