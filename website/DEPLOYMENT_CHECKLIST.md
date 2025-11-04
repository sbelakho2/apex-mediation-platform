# Website Deployment Checklist

Complete checklist for deploying ApexMediation marketing website to production.

## ✅ Pre-Deployment

### 1. Local Development Setup

- [ ] Install dependencies: `cd website && npm install`
- [ ] Verify dev server starts: `npm run dev`
- [ ] Test homepage at http://localhost:3000
- [ ] Verify responsive design (mobile/tablet/desktop)
- [ ] Check browser console for errors
- [ ] Test all links and navigation
- [ ] Verify Study in Sweden design system applies correctly

### 2. Environment Configuration

- [ ] Create `.env.local` from `.env.example`
- [ ] Configure local API URLs:
  ```
  NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
  NEXT_PUBLIC_CONSOLE_URL=http://localhost:3001
  NEXT_PUBLIC_SITE_URL=http://localhost:3000
  ```
- [ ] Test local build: `npm run build`
- [ ] Run production server: `npm start`

### 3. Code Quality

- [ ] Run linter: `npm run lint` (fix all errors)
- [ ] Run type checker: `npm run type-check` (fix all errors)
- [ ] Run tests: `npm test` (all tests passing)
- [ ] Format code: `npm run format`
- [ ] Review CSS lint warnings (44 warnings expected - Tailwind directives)

### 4. Performance Optimization

- [ ] Optimize images (compress, use Next.js Image component)
- [ ] Remove unused dependencies
- [ ] Enable bundle analyzer: `ANALYZE=true npm run build`
- [ ] Check bundle size (<500KB initial load target)
- [ ] Test with slow 3G throttling
- [ ] Run Lighthouse audit (all scores >90)

### 5. SEO & Metadata

- [ ] Verify page titles in `layout.tsx`
- [ ] Check meta descriptions
- [ ] Add OpenGraph images (1200x630px)
- [ ] Test social media previews (Twitter/Facebook debugger)
- [ ] Create `robots.txt` and `sitemap.xml`
- [ ] Add favicon and apple-touch-icon
- [ ] Verify canonical URLs

### 6. Security Review

- [ ] Review security headers in `next.config.js`
- [ ] Verify CSP policy (Content-Security-Policy)
- [ ] Check HTTPS redirects configured
- [ ] Remove sensitive data from client-side code
- [ ] Validate environment variable usage (NEXT_PUBLIC_ prefix for client)
- [ ] Test CORS configuration

## 🚀 Vercel Deployment

### 7. Vercel Account Setup

- [ ] Create Vercel account (or login)
- [ ] Install Vercel CLI: `npm install -g vercel`
- [ ] Login: `vercel login`
- [ ] Link project: `cd website && vercel link`
- [ ] Note project ID and org ID

### 8. Vercel Environment Variables

Add in Vercel dashboard → Project → Settings → Environment Variables:

**Production:**
- [ ] `NEXT_PUBLIC_API_URL=https://api.apexmediation.ee/v1`
- [ ] `NEXT_PUBLIC_CONSOLE_URL=https://console.apexmediation.ee`
- [ ] `NEXT_PUBLIC_SITE_URL=https://apexmediation.bel-consulting.ee`
- [ ] `NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX` (if using Google Analytics)
- [ ] `NEXT_PUBLIC_HOTJAR_ID=XXXXXXX` (if using Hotjar)
- [ ] `API_SECRET_KEY=<generate_random_key>`
- [ ] `SENDGRID_API_KEY=<your_sendgrid_key>` (if using SendGrid)
- [ ] `STRIPE_SECRET_KEY=<your_stripe_key>` (if using Stripe)

**Preview:**
- [ ] Same as production, but with staging URLs

**Development:**
- [ ] Same as `.env.local`

### 9. Custom Domain

- [ ] Add domain in Vercel: `apexmediation.bel-consulting.ee`
- [ ] Configure DNS records:
  ```
  A     @     76.76.21.21
  CNAME www   cname.vercel-dns.com
  ```
- [ ] Wait for DNS propagation (5-30 minutes)
- [ ] Verify SSL certificate issued (automatic)
- [ ] Test HTTPS: https://apexmediation.bel-consulting.ee
- [ ] Test www redirect: https://www.apexmediation.bel-consulting.ee

### 10. GitHub Integration

- [ ] Connect GitHub repository to Vercel
- [ ] Add GitHub secrets (Settings → Secrets → Actions):
  - [ ] `VERCEL_ORG_ID` (from `vercel teams list`)
  - [ ] `VERCEL_PROJECT_ID` (from `vercel project list`)
  - [ ] `VERCEL_TOKEN` (from Vercel settings)
  - [ ] `NEXT_PUBLIC_API_URL`
  - [ ] `NEXT_PUBLIC_CONSOLE_URL`
  - [ ] `NEXT_PUBLIC_SITE_URL`
- [ ] Verify GitHub Actions workflow: `.github/workflows/deploy.yml`
- [ ] Test PR preview: Create test PR and verify preview deployment

### 11. Initial Deployment

**Method 1: CLI**
```bash
cd website
vercel --prod
```

**Method 2: Script**
```bash
cd website
./scripts/deploy.sh deploy:prod
```

**Method 3: Git Push**
```bash
git add .
git commit -m "Initial website deployment"
git push origin main
```

- [ ] Deployment successful
- [ ] Production URL accessible
- [ ] Custom domain working (https://apexmediation.bel-consulting.ee)
- [ ] SSL certificate valid

## ✅ Post-Deployment

### 12. Functionality Testing

- [ ] Test homepage loads correctly
- [ ] Verify hero section displays (blue background, yellow heading)
- [ ] Check features grid (6 cards with emojis)
- [ ] Test CTA buttons ("Get Started Free", "View Documentation")
- [ ] Verify responsive design (mobile/tablet/desktop)
- [ ] Test navigation links (once other pages exist)
- [ ] Check form submissions (if contact form implemented)
- [ ] Test SSO login flow (if auth implemented)

### 13. Performance Verification

- [ ] Run Lighthouse audit on production:
  ```bash
  lighthouse https://apexmediation.bel-consulting.ee
  ```
- [ ] Verify Core Web Vitals:
  - [ ] LCP (Largest Contentful Paint) < 2.5s
  - [ ] FID (First Input Delay) < 100ms
  - [ ] CLS (Cumulative Layout Shift) < 0.1
- [ ] Check page load time < 2s (3G)
- [ ] Verify images optimized (WebP/AVIF)
- [ ] Test from different geographic locations

### 14. SEO Validation

- [ ] Submit sitemap to Google Search Console
- [ ] Verify Google Analytics tracking (if configured)
- [ ] Test social media previews:
  - [ ] https://cards-dev.twitter.com/validator
  - [ ] https://developers.facebook.com/tools/debug/
- [ ] Check robots.txt accessible
- [ ] Verify schema.org markup (if implemented)
- [ ] Test search engine indexing (site:apexmediation.bel-consulting.ee)

### 15. Monitoring Setup

**Health Monitoring:**
```bash
cd website
./scripts/monitor.sh monitor
```
- [ ] Health check script running
- [ ] Status 200 responses
- [ ] Response time < 1s
- [ ] SSL certificate valid (>30 days until expiry)
- [ ] Logs writing to `monitor.log`

**Vercel Analytics:**
- [ ] Enable in Vercel dashboard → Analytics
- [ ] Verify data collection (wait 24 hours)
- [ ] Review traffic patterns

**Google Analytics:**
- [ ] Verify GA tracking code loaded
- [ ] Check real-time reports
- [ ] Create custom dashboards

**Error Tracking (Optional):**
- [ ] Set up Sentry or similar
- [ ] Configure error reporting
- [ ] Test error capture

### 16. Documentation

- [ ] Update README.md with production URLs
- [ ] Document deployment process
- [ ] Create troubleshooting guide
- [ ] Share access with team:
  - [ ] Vercel account access
  - [ ] GitHub repository access
  - [ ] DNS management access
  - [ ] Analytics access
- [ ] Document rollback procedure

### 17. Backup & Recovery

- [ ] Enable Vercel deployment history (automatic)
- [ ] Test rollback: `vercel rollback`
- [ ] Document disaster recovery plan
- [ ] Verify automatic backups configured
- [ ] Test restore from backup

## 🔄 Continuous Deployment

### 18. CI/CD Pipeline

- [ ] GitHub Actions workflow configured
- [ ] Lint check passes on PR
- [ ] Tests pass on PR
- [ ] Build succeeds on PR
- [ ] Preview deployment created on PR
- [ ] Production deployment on merge to main
- [ ] Automatic rollback on failure

### 19. Branch Protection

Configure in GitHub → Settings → Branches → Add rule for `main`:
- [ ] Require PR reviews (1-2 reviewers)
- [ ] Require status checks to pass (lint, test, build)
- [ ] Require branches to be up to date
- [ ] Require conversation resolution
- [ ] Restrict force pushes
- [ ] Restrict deletions

### 20. Monitoring & Alerts

**Set up alerts for:**
- [ ] Website downtime (>3 consecutive failures)
- [ ] Slow response time (>3s)
- [ ] SSL certificate expiring (<30 days)
- [ ] High error rate (>1%)
- [ ] Deployment failures
- [ ] Build failures

**Alert channels:**
- [ ] Email: dev@bel-consulting.ee
- [ ] Slack (optional)
- [ ] PagerDuty (optional)

## 📊 Post-Launch Review

### After 24 Hours

- [ ] Review Vercel Analytics
- [ ] Check Google Analytics traffic
- [ ] Review error logs
- [ ] Monitor performance metrics
- [ ] Check SSL Labs grade (A+)
- [ ] Verify uptime (99.9%+)
- [ ] Review user feedback

### After 7 Days

- [ ] Analyze traffic patterns
- [ ] Identify top pages
- [ ] Review conversion metrics
- [ ] Check bounce rate
- [ ] Analyze device breakdown
- [ ] Review geographic distribution
- [ ] Optimize based on data

### After 30 Days

- [ ] Comprehensive performance review
- [ ] Cost analysis (Vercel usage)
- [ ] Security audit
- [ ] Update dependencies
- [ ] Plan feature releases
- [ ] Review roadmap

## 🐛 Rollback Plan

If deployment fails or critical issues found:

### Quick Rollback (Vercel)
```bash
# List deployments
vercel ls

# Rollback to previous
vercel rollback <deployment-url>
```

### Git Rollback
```bash
# Revert last commit
git revert HEAD
git push origin main

# Or reset to specific commit
git reset --hard <commit-hash>
git push -f origin main
```

### Emergency Maintenance Mode
1. Update Vercel deployment settings
2. Add maintenance page
3. Communicate with users
4. Fix issues in staging
5. Redeploy when ready

## ✅ Final Sign-Off

**Deployment Lead:** _______________
**Date:** _______________
**Deployment Status:** [ ] Success [ ] Failed
**Production URL:** https://apexmediation.bel-consulting.ee
**Rollback Plan:** [ ] Documented [ ] Tested
**Team Notified:** [ ] Yes [ ] No

**Notes:**
```
[Add any deployment notes, issues encountered, or special configurations]
```

---

**Next Steps:**
1. Monitor deployment for 24 hours
2. Collect user feedback
3. Plan next feature release
4. Update roadmap

**Reference Documents:**
- `/website/README.md` - Development guide
- `/WEBSITE_ARCHITECTURE.md` - Architecture documentation
- `/WEBSITE_TODO.md` - Feature roadmap
- `/WEBSITE_DASHBOARD_AUTH_INTEGRATION.md` - SSO integration guide
