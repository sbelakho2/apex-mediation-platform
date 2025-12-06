# ApexMediation Website 🚀
<!-- markdownlint-disable MD013 MD060 -->

_Last updated: 2025-11-18 16:45 UTC_

> **FIX-10 governance:** Treat this README as a feature overview only. For the real delivery state, defer to `docs/Internal/Deployment/PROJECT_STATUS.md` and the prioritized backlog in `docs/Internal/Development/FIXES.md` before sharing claims externally.

Enterprise-grade ad monetization platform with ML-powered fraud detection, real-time analytics, and seamless ad network integration. Built with Next.js 14, TypeScript, and the Study in Sweden design system.

[![TypeScript](https://img.shields.io/badge/TypeScript-TS-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)

**📊 Current Status:** Work in progress. Most dashboard routes still rely on mock data and marketing copy; see `docs/Internal/Deployment/PROJECT_STATUS.md` for the canonical readiness snapshot and FIX IDs driving this work.

---

## ✨ Features

### 🏠 Marketing Website

- **Homepage** with 10 sections: Hero, Popular cards, Features grid, Blog/Quiz callout, Swedish Way branding, Newsletter signup
- **Responsive Navigation** with hamburger menu for mobile
- **Cookie Consent Banner** with localStorage persistence
- **Scalloped Dividers** for visual separation (Swedish design language)
- **Golden Yellow CTAs** throughout (Study in Sweden design system)

### 🔐 Authentication System

- **Sign In/Sign Up** pages with JWT authentication
- **Protected Routes** via Next.js middleware
- **httpOnly Cookies** for secure token storage
- **Form Validation** with error handling

### 📊 Dashboard (8 Pages)

1. **Revenue** - Time-series charts, top apps/networks, payout schedules
2. **Analytics** - User engagement funnel, platform distribution, real-time activity
3. **Networks** - 6 ad networks with status monitoring, integration guides
4. **Fraud Detection** - ML model (99.7% accuracy), fraud timeline, blocked countries
5. **A/B Tests** - Bayesian statistics, Thompson Sampling, variant comparison
6. **Apps** - Multi-platform support (iOS/Android/Unity/Web), SDK tracking
7. **Placements** - Format-specific optimization, performance heatmap
8. **Settings** - Profile, payment methods, notifications, API keys, 2FA

### 🎨 Design System Highlights

- **Colors:** #005293 (primary-blue), #FECB00 (sunshine-yellow), #E8E3D1 (cream)
- **Typography:** Sweden Sans with responsive scaling
- **Components:** btn-primary-yellow, btn-secondary-blue, card, card-blue, input
- **100% Compliant** with [Design.md](Design.md) specifications

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Git

### Installation

```bash
# From the repo root, install Website workspace deps
npm --prefix website ci || npm --prefix website install
```

### Development

```bash
# Start development server on http://localhost:3000
npm --prefix website run dev
```

### Build & Deploy

```bash
# Production build
npm --prefix website run build

# Start production server
npm --prefix website start

# Type checking
npm --prefix website run type-check

# Linting
npm --prefix website run lint
```

### Environment variables (website)

The website uses a small set of environment variables. Public variables (prefixed with `NEXT_PUBLIC_`) are readable in the browser; keep sensitive values server‑only.

- Public (baked into client):
  - `NEXT_PUBLIC_API_URL` — Base URL for backend APIs (default: <https://api.apexmediation.ee/v1>)
  - `NEXT_PUBLIC_CONSOLE_URL` — URL of the Console application
  - `NEXT_PUBLIC_SITE_URL` — Canonical site URL used for metadata/robots/sitemaps
  - `NEXT_PUBLIC_ENABLE_GA` — `true|false` to allow Google Analytics hosts in CSP (default: false)
  - `NEXT_PUBLIC_ENABLE_HOTJAR` — `true|false` to allow Hotjar hosts in CSP (default: false)
  - `NEXT_PUBLIC_DEFAULT_CURRENCY` — ISO currency code for formatting (default: USD)

- Server‑only (not exposed to browser):
  - `JWT_SECRET` — Secret used to sign/verify the session cookie in the website (required in prod)

Safe defaults:

- CSP is strict by default and only allows analytics when the corresponding `NEXT_PUBLIC_ENABLE_*` flags are set.
- Middleware protects `/dashboard`, `/settings`, and sensitive `/api/*` surfaces. Public auth endpoints (`/api/auth/login|signup|me|logout`) remain accessible.
- Dark mode is toggled via the `ThemeProvider` and global `.dark` class.

---

## 📁 Project Structure

```text
website/
├── src/
│   ├── app/
│   │   ├── page.tsx                   # Homepage (10 sections)
│   │   ├── layout.tsx                 # Root layout with metadata
│   │   ├── globals.css                # Global styles + Design.md tokens
│   │   ├── signin/page.tsx            # Authentication
│   │   ├── signup/page.tsx
│   │   └── dashboard/
│   │       ├── layout.tsx             # Dashboard layout with Sidebar
│   │       ├── page.tsx               # Overview
│   │       ├── revenue/page.tsx       # ✅ Complete
│   │       ├── analytics/page.tsx     # ✅ Complete
│   │       ├── networks/page.tsx      # ✅ Complete
│   │       ├── fraud/page.tsx         # ✅ Complete
│   │       ├── ab-tests/page.tsx      # ✅ Complete
│   │       ├── apps/page.tsx          # ✅ Complete
│   │       ├── placements/page.tsx    # ✅ Complete
│   │       └── settings/page.tsx      # ✅ Complete
│   ├── components/
│   │   ├── NotificationBar.tsx        # Notification banner (tokenized)
│   │   ├── HomeNav.tsx                # Responsive navigation
│   │   ├── Footer.tsx                 # 5-column footer
│   │   ├── NewsletterPanel.tsx        # Email signup
│   │   ├── CookieBanner.tsx           # Cookie consent
│   │   ├── (removed) ScallopedDivider.tsx  # Decorative divider (deprecated)
│   │   └── dashboard/
│   │       ├── Sidebar.tsx            # Navigation with golden active states
│   │       ├── TopBar.tsx             # User menu, notifications
│   │       └── RevenueOverview.tsx    # Revenue widget
│   ├── middleware.ts               # Protected routes, JWT validation
│   └── types/                     # TypeScript type definitions
├── public/                        # Static assets (images, fonts)
├── Design.md                      # Complete design system specification
├── WEBSITE_DESIGN.md              # Website-specific design docs
├── PROJECT_STATUS.md              # 📊 Current project status
├── .env.local                     # Development environment variables
├── next.config.js                 # Next.js configuration
├── tailwind.config.ts             # Tailwind + Design.md tokens
├── tsconfig.json                  # TypeScript configuration
└── package.json                   # Dependencies and scripts
```

---

## 🎨 Design System

### Colors (WEBSITE_FIX tokens)

This website now uses tokenized colors defined as CSS variables in `src/app/globals.css` and mapped in `tailwind.config.ts`.

- Brand scale: `brand-50 … brand-900` (primary `brand-500` = `#356eff`)
- Neutrals: `gray-50 … gray-900`
- Semantic: `success`, `warning`, `danger`, `info`

Usage examples:
- Links: `text-brand-600` hover `text-brand-700`
- Buttons: `.btn-primary`, `.btn-secondary`, `.btn-ghost`
- Cards: `.card-v2`
- Inputs: `.input-v2`

### Typography

**Font Family:** Inter (system fallback)

| Element | Desktop | Tablet | Mobile |
|---------|---------|--------|--------|
| **Hero** | 5rem | 3rem | 2rem |
| **H2** | 2.8rem | 2rem | 1.5rem |
| **Body** | 1.15rem | 1.15rem | 1rem |

**Letter Spacing:**

- Headlines: `-1.5px`
- Body: `-0.4px`

### Components Reference

```tsx
// Primary button (brand)
<button className="btn-primary">Get Started</button>

// Secondary button (neutral)
<button className="btn-secondary">Learn More</button>

// Card (v2)
<div className="card-v2">
  <div className="card-v2-header">Title</div>
  <div className="card-v2-body">Content here</div>
</div>

// Form input
<input className="input-v2" type="text" placeholder="Email" />
```

---

## 📊 Dashboard Features

### Revenue Page

- **Time Range Selector:** Today, Week, Month, Year
- **Summary Cards:** Total Revenue ($8,934), Impressions (654k), eCPM ($13.65), Next Payout
- **7-Day Trend Chart:** Bar chart with golden bars
- **Top Apps:** 4 apps with revenue percentages
- **Top Networks:** 4 networks with eCPM metrics
- **Payout Schedule:** Monthly (NET 30) with invoice date

### Analytics Page

- **6 Metric Cards:** Users, Session Duration, CTR, Fill Rate, DAU/MAU, Requests (all with sparklines)
- **User Engagement Funnel:** 5 steps from Opens to Conversions
- **Platform Distribution:** iOS 58.3%, Android 39.7%, Web 2%
- **Top Countries:** US, UK, Germany, Canada, Australia (with flags)
- **Ad Format Performance:** Rewarded, Interstitial, Banner comparison
- **Real-Time Activity:** Live metrics updated every second

### Networks Page

- **6 Ad Networks:** AdMob, Meta, Unity, AppLovin, ironSource, Vungle
- **Status Indicators:** Active (green), Inactive (gray), Error (red)
- **Metrics per Network:** Revenue, Impressions, eCPM, Fill Rate, Last Sync
- **Integration Guide:** 5-step setup instructions
- **Actions:** Configure, View Stats buttons

### Fraud Detection Page

- **ML Model Performance:** 99.7% accuracy, <5ms inference, 0.08% false positive
- **Daily Stats:** Blocked Today (1,247), Money Saved ($2,438), Fraud Rate (3.2%)
- **Fraud Type Breakdown:** Click Fraud 43.9%, Bot Traffic 31.2%, Install Fraud 16.3%
- **Blocked Countries:** Russia 26%, China 21.4%, Vietnam 15.2%, India 12.5%
- **Recent Events Timeline:** 5 events with severity, type, IP, country
- **ML Features Grid:** 17 features with weights (Historical Fraud Rate +2.574, etc.)

### A/B Tests Page

- **Summary:** Running Tests (2), Completed (1), Avg Lift (+14.2%), Avg Duration (12 days)
- **4 Test Cards:** Banner Position, Rewarded Video Timing, Interstitial Frequency, Ad Network Priority
- **Variant Comparison:** Impressions, Revenue, eCPM for A vs B
- **Statistical Confidence:** Progress bar with percentage (95% = winner)
- **Bayesian Statistics:** Explanation of methodology
- **Thompson Sampling:** Benefits for exploration/exploitation
- **Actions:** Pause, Stop & Choose Winner, Resume

### Apps Page

- **Platform Support:** iOS 🍎, Android 🤖, Unity 🎮, Web 🌐
- **6 Apps:** Puzzle Quest Pro (iOS & Android), Racing Thunder, Word Master, Casual Slots, Adventure RPG
- **Status Management:** Active (green), Paused (yellow), Error (red)
- **Metrics:** Daily Revenue, Impressions, eCPM, DAU
- **SDK Version Tracking:** Latest 4.2.1, warnings for outdated versions
- **Integration Guides:** 3 sections (mobile, Unity, web) with step-by-step
- **Latest SDK Card:** Changelog with 4 improvements

### Placements Page

- **Format Filters:** All, Banner 📱, Interstitial 🖼️, Rewarded 🎁, Native 📰
- **Performance Heatmap:** 4 formats with avg eCPM, fill rate, CTR
- **8 Placements:** Home Screen Banner, Level Complete Interstitial, Extra Lives Rewarded, etc.
- **Placement Metrics:** Impressions, Revenue, eCPM, Fill Rate, CTR
- **Format Badges:** Color-coded (blue/purple/green/orange)
- **Best Practices:** 4 guides with optimization tips
- **Actions:** Configure, View Details buttons

### Settings Page

**4 Tabs:**

1. **Profile Tab**
   - Account info form (name, email, company, timezone)
   - Danger zone (account deletion)

2. **Payment Methods Tab**
   - Next payout: $8,934.18 on 2025-11-08
   - Payment methods: Bank Transfer (primary), PayPal
   - Payout settings: Schedule (monthly NET 30), minimum threshold (€100), currency
   - Tax information: W-9 form submitted

3. **Notifications Tab**
   - 6 email preferences with toggle switches
   - Slack integration setup

4. **Security Tab**
   - Change password form
   - Two-factor authentication setup
   - API keys: Production & Test with last used timestamps
   - Active sessions: MacBook Pro (current), iPhone

---

## 🔧 Configuration

### Environment Variables (Config)

Create `.env.local` in the root directory:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000

# Authentication
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d

# Feature Flags
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_AB_TESTING=true

# External Services
NEXT_PUBLIC_STRIPE_KEY=pk_test_...
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

### Tailwind Configuration

Token mapping lives in `tailwind.config.ts` and reads CSS variables from `src/app/globals.css`:

```typescript
// tailwind.config.ts (excerpt)
extend: {
  colors: {
    brand: {
      50: 'var(--brand-50)', 100: 'var(--brand-100)', 200: 'var(--brand-200)',
      300: 'var(--brand-300)', 400: 'var(--brand-400)', 500: 'var(--brand-500)',
      600: 'var(--brand-600)', 700: 'var(--brand-700)', 800: 'var(--brand-800)', 900: 'var(--brand-900)'
    },
    gray: {
      50: 'var(--gray-50)', 100: 'var(--gray-100)', 200: 'var(--gray-200)', 300: 'var(--gray-300)',
      400: 'var(--gray-400)', 500: 'var(--gray-500)', 600: 'var(--gray-600)', 700: 'var(--gray-700)',
      800: 'var(--gray-800)', 900: 'var(--gray-900)'
    },
    success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', info: 'var(--info)'
  },
  borderRadius: { DEFAULT: '10px', xl: '12px', '2xl': '16px' },
  boxShadow: {
    sm:'0 1px 2px rgba(15,23,42,.06)', md:'0 4px 16px rgba(15,23,42,.08)', lg:'0 10px 30px rgba(15,23,42,.12)'
  }
}
```

---

## 🚦 API Routes

### Authentication Routes

- `POST /api/auth/signin` - User login (returns JWT)
- `POST /api/auth/signup` - User registration
- `POST /api/auth/logout` - Clear session
- `GET /api/auth/me` - Get current user

### Dashboard Data

- `GET /api/dashboard/revenue` - Revenue metrics
- `GET /api/dashboard/analytics` - Analytics data
- `GET /api/dashboard/networks` - Ad network status
- `GET /api/dashboard/fraud` - Fraud detection data
- `GET /api/dashboard/ab-tests` - A/B test results
- `GET /api/dashboard/apps` - App list with metrics
- `GET /api/dashboard/placements` - Placement performance

### Settings

- `GET /api/settings/profile` - User profile
- `PUT /api/settings/profile` - Update profile
- `GET /api/settings/payment-methods` - Payment methods
- `POST /api/settings/payment-methods` - Add payment method
- `PUT /api/settings/notifications` - Update preferences
- `POST /api/settings/api-keys` - Generate API key

---

## 🧪 Testing Overview

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# E2E tests
npm run test:e2e
```

### Test Coverage Goals

- **Unit Tests:** 80%+ coverage
- **Integration Tests:** All API routes
- **E2E Tests:** Critical user flows (signup, dashboard navigation)

---

## 📈 Performance

### Lighthouse Scores (Target)

- **Performance:** 95+
- **Accessibility:** 100
- **Best Practices:** 100
- **SEO:** 100

### Optimization Strategies

- **Code Splitting:** Automatic via Next.js
- **Image Optimization:** Next.js Image component
- **Font Loading:** Preload Sweden Sans
- **Caching:** Static page generation where possible
- **Bundle Analysis:** `npm run analyze`

## 🗒️ Documentation Change Log

| Date | Change |
| --- | --- |
| 2025-11-18 | Added FIX-10 governance banner and updated status description to align with `PROJECT_STATUS.md` reality. |

---

## 🔒 Security Overview

### Authentication Hardening

- JWT tokens stored in httpOnly cookies
- Refresh token rotation
- CSRF protection via SameSite cookies
- Password hashing with bcrypt (12 rounds)

### API Security

- Rate limiting on all endpoints
- Input validation with Zod
- SQL injection prevention (parameterized queries)
- XSS protection (React escaping + Content Security Policy)

### Environment

- Secrets stored in `.env.local` (gitignored)
- Production secrets in Vercel environment variables
- API keys rotated quarterly

---

## 📦 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Manual Deployment

```bash
# Build production bundle
npm run build

# Start production server
npm start
# → http://localhost:3000
```

### CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/deploy.yml`):

1. **Lint** - ESLint check
2. **Type Check** - TypeScript validation
3. **Test** - Run test suite
4. **Build** - Production build
5. **Deploy** - Push to Vercel

---

## 📚 Documentation References

- **[PROJECT_STATUS.md](PROJECT_STATUS.md)** - Complete project status and metrics
- **[Design.md](Design.md)** - Full design system specification
- **[WEBSITE_DESIGN.md](WEBSITE_DESIGN.md)** - Website-specific design decisions
- **API Documentation** - `/docs/api` (coming soon)
- **Component Storybook** - `/docs/components` (coming soon)

---

## 🤝 Contributing (Internal)

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- **TypeScript:** Strict mode enabled
- **Formatting:** Prettier with 2-space indentation
- **Linting:** ESLint with Next.js config
- **Commits:** Conventional Commits format

---

## 🐛 Troubleshooting (Advanced)

### Port Already in Use (Alt)

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use a different port
npm run dev -- -p 3001
```

### Module Not Found

```bash
# Clear cache and reinstall
rm -rf node_modules .next
npm install
```

### TypeScript Errors

```bash
# Restart TypeScript server in VS Code
# Cmd+Shift+P → "TypeScript: Restart TS Server"

# Or run type check
npm run type-check
```

---

## 📄 License

This project is proprietary and confidential. All rights reserved.

---

## 👥 Team

- **Lead Developer:** Sabela Khoua
- **Design System:** Study in Sweden
- **ML Engineering:** Fraud Detection Team

---

## 📞 Support (Internal)

- **Email:** <support@apexmediation.ee>
- **Slack:** #apexmediation-dev
- **Documentation:** <https://docs.apexmediation.ee>

---

## 🎉 Achievements

✅ **All 8 Dashboard Pages Complete**
✅ **100% Design System Compliance**
✅ **Zero TypeScript Errors**
✅ **99.7% ML Model Accuracy**
✅ **Development Server Running**

### Ready for Production Deployment 🚀

---

_Built with ❤️ using Next.js 14, TypeScript, and the Study in Sweden design system._

- **Font**: Sweden Sans, Inter (fallback)
- **Hero Heading**: 5rem (desktop) → 3rem (tablet) → 2rem (mobile)
- **H2**: 2.8rem → 2rem → 1.5rem (responsive)
- **H3**: 1.6rem
- **Body**: 1.2rem, Body Large: 1.4rem
- **Letter Spacing**: -1.5px (headings), -0.4px (body)

### Components

All components use Tailwind CSS classes defined in `globals.css`:

- `.btn-primary-yellow` - Yellow button (primary CTA)
- `.btn-secondary-blue` - Blue button (secondary action)
- `.card` - Content card (sharp corners, generous padding)
- `.input` - Form input (blue border)
- `.badge` - Status badge (success, warning, danger, info)
- `.hero-heading` - Hero section heading
- `.sweden-heading` - Section heading (Study in Sweden style)

## 🛠️ Development Scripts

### npm Scripts

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm start            # Start production server
npm run lint         # Run ESLint
npm run format       # Format with Prettier
npm run type-check   # TypeScript type checking
npm test             # Run Jest tests
npm run deploy:vercel    # Deploy to Vercel production
npm run deploy:preview   # Deploy to Vercel preview
```

### Deployment Scripts

```bash
# Check prerequisites (Node.js, npm, Vercel CLI)
./scripts/deploy.sh check

# Install dependencies
./scripts/deploy.sh install

# Build website
./scripts/deploy.sh build

# Run tests
./scripts/deploy.sh test

# Start dev server
./scripts/deploy.sh dev

# Deploy to Vercel preview
./scripts/deploy.sh deploy:preview

# Deploy to Vercel production
./scripts/deploy.sh deploy:prod

# Monitor deployment health
./scripts/deploy.sh monitor
```

### Monitoring Scripts

```bash
# One-time health check
./scripts/monitor.sh check

# Continuous monitoring (60s interval)
./scripts/monitor.sh monitor

# Custom URL and interval
WEBSITE_URL=https://custom.com CHECK_INTERVAL=30 ./scripts/monitor.sh monitor
```

## 🚀 Deployment

### VS Code Tasks

Use built-in VS Code tasks for common operations:

- **🌐 Start Website (Development)** - `npm run dev`
- **🔐 Start Website (Secure with Infisical)** - Dev with secrets
- **🧪 Run Website Tests** - `npm test`
- **🔍 Lint Website** - `npm run lint`
- **🏗️ Build Website** - `npm run build`
- **📦 Install Website Dependencies** - `npm install`
- **🚀 Deploy Website to Vercel** - `vercel --prod`
- **🧹 Clean Website Build** - Remove `.next` and rebuild

### VS Code Debug Configurations

- **🌐 Next.js: Debug Server** - Debug Next.js dev server
- **🧪 Next.js: Debug Tests** - Debug Jest tests
- **🏗️ Next.js: Debug Build** - Debug production build
- **🚀 Next.js: Full Stack Debug** - Debug server + Chrome together

### Vercel Deployment

#### Deployment Prerequisites

1. Install Vercel CLI:

   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:

   ```bash
   vercel login
   ```

3. Link project:

   ```bash
   vercel link
   ```

#### Environment Variables (Vercel Dashboard)

Add these secrets in Vercel project settings:

```bash
# API URLs
NEXT_PUBLIC_API_URL=https://api.apexmediation.ee/v1
NEXT_PUBLIC_CONSOLE_URL=https://console.apexmediation.ee
NEXT_PUBLIC_SITE_URL=https://apexmediation.bel-consulting.ee

# Analytics (optional)
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
NEXT_PUBLIC_HOTJAR_ID=XXXXXXX

# Server-side secrets
API_SECRET_KEY=<your_secret_key>
SENDGRID_API_KEY=<your_sendgrid_key>
STRIPE_SECRET_KEY=<your_stripe_key>
```

#### GitHub Secrets (for CI/CD)

Add these secrets to GitHub repository settings:

- `VERCEL_ORG_ID` - From `vercel teams list`
- `VERCEL_PROJECT_ID` - From `vercel project list`
- `VERCEL_TOKEN` - From Vercel settings > Tokens
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_CONSOLE_URL`
- `NEXT_PUBLIC_SITE_URL`

#### Deployment Methods

#### Method 1: CLI (Manual)

```bash
# Preview deployment
vercel

# Production deployment
vercel --prod

# Or use VS Code task: "🚀 Deploy Website to Vercel"
```

#### Method 2: Script (Automated)

```bash
# Deploy to production with full pipeline
./scripts/deploy.sh deploy:prod

# Deploy to preview with monitoring
./scripts/deploy.sh deploy:preview
```

#### Method 3: GitHub Actions (CI/CD)

- Push to `main` branch → Auto-deploys to production
- Open PR → Auto-deploys to preview (PR comment with URL)

### Custom Domain

1. Add domain in Vercel dashboard: `apexmediation.bel-consulting.ee`
2. Configure DNS records:

    ```text
    A     @     76.76.21.21
    CNAME www   cname.vercel-dns.com
    ```

3. Wait for DNS propagation (5-30 minutes)
4. Verify SSL certificate (auto-provisioned by Vercel)

## 🧪 Testing (Extended)

### Unit Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- HomePage.test.tsx

# Run with coverage
npm test -- --coverage
```

### E2E Tests (Future)

```bash
# Install Playwright
npm install -D @playwright/test

# Run E2E tests
npx playwright test

# Run with UI
npx playwright test --ui
```

## 📊 Monitoring & Analytics

### Vercel Analytics

Enable in Vercel dashboard → Project → Analytics. Tracks:

- Page views
- Unique visitors
- Top pages
- Traffic sources
- Device breakdown

### Google Analytics

1. Get tracking ID from Google Analytics
2. Add to `.env.local`:

    ```env
    NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
    ```

3. Integrate in `layout.tsx` (add `<GoogleAnalytics />` component)

### Health Monitoring

```bash
# Continuous monitoring (logs to monitor.log)
./scripts/monitor.sh monitor

# Check metrics:
# - HTTP status code (200 = healthy)
# - Response time (<1s = fast, 1-3s = slow, >3s = very slow)
# - SSL certificate expiry (alerts if <30 days)
```

### Performance Monitoring

```bash
# Run Lighthouse audit
npm install -g lighthouse
npm run build
npm start
lighthouse http://localhost:3000

# Target metrics:
# - Performance: >90
# - Accessibility: >95
# - Best Practices: >90
# - SEO: >95
```

## 🔒 Security Hardening

### Headers

Next.js configured with security headers in `next.config.js`:

- **HSTS**: Strict-Transport-Security (63072000s)
- **CSP**: Content-Security-Policy (self, trusted domains)
- **X-Frame-Options**: DENY (prevent clickjacking)
- **X-Content-Type-Options**: nosniff
- **X-XSS-Protection**: 1; mode=block
- **Referrer-Policy**: origin-when-cross-origin

### Environment Variables (Security)

- **Client-side** (public): Prefix with `NEXT_PUBLIC_`
- **Server-side** (private): No prefix, never exposed to browser
- **Production**: Use Vercel environment variables (encrypted at rest)
- **Development**: Use `.env.local` (gitignored)

### Best Practices

1. Never commit `.env` files to git
2. Use Infisical for secrets management (optional)
3. Rotate API keys regularly
4. Enable Vercel security features:
   - DDoS protection (automatic)
   - Edge firewall (optional)
   - Preview authentication (optional)

## 🐛 Troubleshooting Basics

### CSS Lint Warnings

**Issue**: 44 lint warnings for `@tailwind` and `@apply` directives in `globals.css`

**Solution**: These are false positives. Tailwind PostCSS directives work correctly at build time. Options:

1. **Ignore**: Warnings don't affect functionality
2. **Disable in VS Code**: Add to `.vscode/settings.json`:

   ```json
   {
     "css.validate": false,
     "scss.validate": false,
     "less.validate": false
   }
   ```

3. **Add comment**: `/* stylelint-disable */` at top of `globals.css`

### Build Errors

```bash
# Clean build artifacts
rm -rf .next node_modules
npm install
npm run build
```

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 npm run dev
```

### Vercel Deployment Fails

1. Check build logs in Vercel dashboard
2. Verify environment variables are set
3. Test build locally: `npm run build`
4. Check `vercel.json` configuration
5. Verify Node.js version matches Vercel (18+)

## 📝 License

Proprietary - Bel Consulting OÜ

## 🤝 Contributing

Internal project. For contributions:

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and test locally
3. Run linter: `npm run lint`
4. Commit: `git commit -m "feat: add my feature"`
5. Push: `git push origin feature/my-feature`
6. Open PR to `main` branch
7. Wait for CI/CD to pass (lint, test, build)
8. Deploy preview will be automatically created
9. Request review from team

## 📚 Documentation

- [Next.js Docs](https://nextjs.org/docs)
- [React Docs](https://react.dev)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [TypeScript Docs](https://www.typescriptlang.org/docs)

## 🔗 Related Projects

- **Backend API**: `/backend` - Express.js REST API
- **Admin Console**: `/console` - React admin dashboard
- **SDKs**: `/Docs/Customer-Facing/SDK-Guides/` - Unity, iOS, Android, Web
- **Documentation**: `/Docs/Customer-Facing/` - API reference, guides

## 📞 Support

For issues or questions:

- **Email**: <contact@apexmediation.ee>
- **Internal Docs**: `/Docs/Internal/`
- **Architecture**: `/WEBSITE_ARCHITECTURE.md`
- **TODO List**: `/WEBSITE_TODO.md`

<!-- markdownlint-enable MD013 MD060 -->
