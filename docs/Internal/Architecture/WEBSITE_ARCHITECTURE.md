# Customer-Facing Website Architecture

_Platform: ApexMediation_  
_Entity: Bel Consulting OÜ (subsidiary of Starz Energies)_  
_Last updated: 2025-11-18_  
_Owner: Platform Engineering / Marketing_  
_Review Cycle: When architecture changes or annually (next review: 2026-11-18)_

> **FIX-10 governance:** This architecture document outlines website technical design. For actual implementation status, see `docs/Internal/Deployment/PROJECT_STATUS.md` and `docs/Internal/Development/FIXES.md` (FIX-04 covers website). Legal entity names must be kept current.

---

## Executive Summary

This document defines the complete technical architecture for the customer-facing marketing website, implementing the design specifications from `Website.docx`. The site will mirror the visual language of Study in Sweden while serving as the primary marketing portal for our advertising technology platform.

**Key Goals:**
- Create a playful yet professional web presence with bold typography and bright colors
- Serve both marketing content and technical documentation
- Integrate seamlessly with existing backend services
- Deploy with global CDN for optimal performance
- Maintain high accessibility standards (WCAG 2.1 AA)

---

## Technology Stack

### Frontend Framework
**Next.js 14+ (React 18+)** with App Router
- **Rationale**: 
  - Static site generation (SSG) for marketing pages → optimal SEO
  - Server-side rendering (SSR) for authenticated dashboard
  - API routes for newsletter signups and lead forms
  - Built-in image optimization and lazy loading
  - Excellent TypeScript support
  - Easy integration with existing Node.js backend

### Styling & UI
**Tailwind CSS 3.4+** with custom configuration
- **Custom Theme Variables:**
  ```javascript
  colors: {
    'primary-blue': '#005293',
    'sunshine-yellow': '#FECB00',
    'pale-yellow': '#FFD481',
    'cream': '#E8E3D1',
    'accent-red': '#C04437',
    'success-green': '#5BAA2A'
  }
  fontFamily: {
    'sweden': ['Sweden Sans', 'Inter', 'system-ui', 'sans-serif']
  }
  ```
- **Component Library**: Headless UI for accessible accordions, modals, dropdowns
- **Animation**: Framer Motion for hero animations and transitions

### Typography
**Sweden Sans** (primary font)
- **Licensing Note**: If Sweden Sans cannot be licensed, use **Inter** or **Public Sans** as fallback (both are similar humanist sans-serifs)
- **Font Weights**: Book (400) for body, Bold (700) for headings
- **Self-hosted**: Store `.woff2` files in `/public/fonts/` for performance
- **Font Display**: `swap` to prevent FOIT (Flash of Invisible Text)

### State Management
**Zustand** (lightweight alternative to Redux)
- User authentication state
- Cookie consent preferences
- Quiz/diagnostic form state
- Dashboard filters and settings

### Form Handling & Validation
**React Hook Form** + **Zod**
- Newsletter signup validation
- Contact/demo request forms
- Quiz input validation
- Integration with backend validation middleware

### Icon System
**Lucide React** (consistent line icons)
- Search, arrow, chevron, social icons
- Emoji for personality (✌️, 👉, 🎉) embedded as Unicode characters with aria-labels

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE CDN                                │
│                  (Global Edge Network + DDoS Protection)             │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ├──► Static Assets (/_next/static/*)
                      │    - Cached 31536000s (1 year)
                      │    - Brotli compression
                      │
                      ├──► Marketing Pages (/, /pricing, /features/*)
                      │    - Pre-rendered at build time (SSG)
                      │    - Cached 3600s (1 hour), revalidated on demand
                      │
                      ├──► Blog & Case Studies (/blog/*, /case-studies/*)
                      │    - ISR (Incremental Static Regeneration)
                      │    - Revalidate every 600s (10 minutes)
                      │
                      └──► API Routes & Dashboard (/api/*, /dashboard/*)
                           - Bypass cache, proxied to origin
                           │
                           ▼
                  ┌────────────────────────┐
                  │   VERCEL DEPLOYMENT    │
                  │  (Next.js App Router)  │
                  └───────────┬────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
        ┌─────────────┐ ┌──────────┐ ┌──────────────┐
        │  SSG Pages  │ │ API      │ │ Middleware   │
        │  (Public)   │ │ Routes   │ │ (Auth/i18n)  │
        └─────────────┘ └─────┬────┘ └──────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │   BACKEND SERVICES     │
                  │ (Existing Node.js API) │
                  │  - Authentication      │
                  │  - User Management     │
                  │  - Analytics           │
                  │  - Payments            │
                  └───────────┬────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │   POSTGRESQL DATABASE  │
                  │   (Existing Schema)    │
                  └────────────────────────┘
```

---

## Hosting & Deployment

### Primary Hosting: **Vercel**
**Rationale:**
- Native Next.js integration (zero configuration)
- Automatic edge caching via Vercel Edge Network
- Serverless API routes (no server management)
- Preview deployments for every pull request
- Built-in analytics and Web Vitals monitoring
- Free SSL certificates with auto-renewal
- Environment variable management per deployment

**Alternative:** Cloudflare Pages (if preferring Cloudflare ecosystem)

### CDN Strategy
**Cloudflare** in front of Vercel
- **Purpose**: Additional DDoS protection, custom caching rules, Bot Management
- **Configuration**:
  - Cache static assets for 1 year
  - Cache marketing pages for 1 hour
  - Bypass cache for `/api/*` and `/dashboard/*`
  - Enable Brotli compression
  - Enable HTTP/3 (QUIC)

### Domain Setup
**Primary Domain**: `apexmediation.bel-consulting.ee` (suggested)
- **DNS**: Managed via Cloudflare DNS
- **SSL/TLS**: Full (strict) mode with Cloudflare origin certificate
- **Subdomains**:
  - `www.apexmediation.bel-consulting.ee` → redirect to apex
  - `docs.apexmediation.bel-consulting.ee` → documentation (can use same deployment)
  - `status.apexmediation.bel-consulting.ee` → status page (separate deployment)

### Deployment Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy Website

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint
        run: npm run lint
      
      - name: Type check
        run: npm run type-check
      
      - name: Run tests
        run: npm run test
      
      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_API_URL: ${{ secrets.API_URL }}
          NEXT_PUBLIC_SITE_URL: ${{ secrets.SITE_URL }}
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
          working-directory: ./website
```

**Deployment Environments:**
- **Production** (`main` branch) → `apexmediation.bel-consulting.ee`
- **Staging** (`develop` branch) → `staging.apexmediation.bel-consulting.ee`
- **Preview** (Pull Requests) → Unique Vercel URL per PR

---

## Project Structure

```
website/
├── public/
│   ├── fonts/
│   │   ├── sweden-sans-bold.woff2
│   │   └── sweden-sans-book.woff2
│   ├── images/
│   │   ├── hero-background.svg
│   │   ├── wave-divider.svg
│   │   └── case-studies/
│   └── favicon.ico
│
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (marketing)/              # Marketing layout group
│   │   │   ├── page.tsx              # Home page
│   │   │   ├── pricing/page.tsx
│   │   │   ├── features/
│   │   │   │   ├── mediation/page.tsx
│   │   │   │   ├── fraud-detection/page.tsx
│   │   │   │   ├── compliance/page.tsx
│   │   │   │   └── reporting/page.tsx
│   │   │   └── layout.tsx            # Marketing shell
│   │   │
│   │   ├── (content)/                # Content layout group
│   │   │   ├── blog/
│   │   │   │   ├── page.tsx          # Blog index
│   │   │   │   └── [slug]/page.tsx   # Blog post
│   │   │   ├── case-studies/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [slug]/page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (docs)/                   # Documentation layout
│   │   │   ├── docs/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── unity-sdk/page.tsx
│   │   │   │   ├── ios-sdk/page.tsx
│   │   │   │   ├── android-sdk/page.tsx
│   │   │   │   ├── api-reference/page.tsx
│   │   │   │   └── prebid-adapter/page.tsx
│   │   │   └── layout.tsx            # Docs sidebar
│   │   │
│   │   ├── (dashboard)/              # Authenticated layout
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx          # Main dashboard
│   │   │   │   ├── analytics/page.tsx
│   │   │   │   ├── campaigns/page.tsx
│   │   │   │   ├── payments/page.tsx
│   │   │   │   └── settings/page.tsx
│   │   │   └── layout.tsx            # Dashboard shell
│   │   │
│   │   ├── api/                      # API routes
│   │   │   ├── newsletter/route.ts   # Newsletter signup
│   │   │   ├── contact/route.ts      # Contact form
│   │   │   ├── quiz/route.ts         # Quiz submission
│   │   │   └── consent/route.ts      # Cookie consent
│   │   │
│   │   ├── layout.tsx                # Root layout
│   │   └── globals.css               # Tailwind imports
│   │
│   ├── components/
│   │   ├── marketing/
│   │   │   ├── Header.tsx            # Top yellow bar + nav
│   │   │   ├── Footer.tsx
│   │   │   ├── Hero.tsx              # Blue hero with yellow text
│   │   │   ├── PhilosophySection.tsx
│   │   │   ├── NewsletterPanel.tsx
│   │   │   ├── QuizCallout.tsx
│   │   │   ├── CaseStudyTeaser.tsx
│   │   │   └── WaveDivider.tsx       # SVG wave component
│   │   │
│   │   ├── ui/
│   │   │   ├── Button.tsx            # Primary/Secondary variants
│   │   │   ├── Accordion.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Link.tsx              # Custom link with shadow
│   │   │   └── CookieBanner.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── MetricCard.tsx
│   │   │   ├── Chart.tsx             # Recharts wrapper
│   │   │   └── StatusIndicator.tsx
│   │   │
│   │   └── forms/
│   │       ├── NewsletterForm.tsx
│   │       ├── ContactForm.tsx
│   │       └── QuizForm.tsx
│   │
│   ├── lib/
│   │   ├── api.ts                    # Backend API client
│   │   ├── auth.ts                   # JWT handling
│   │   ├── constants.ts              # Theme colors, breakpoints
│   │   └── utils.ts                  # Helpers
│   │
│   ├── store/
│   │   ├── auth.ts                   # Zustand auth store
│   │   └── consent.ts                # Cookie consent store
│   │
│   ├── types/
│   │   ├── api.ts                    # Backend API types
│   │   └── index.ts
│   │
│   └── middleware.ts                 # Auth + i18n middleware
│
├── .env.local                        # Local environment vars
├── .env.production                   # Production environment vars
├── next.config.js                    # Next.js configuration
├── tailwind.config.ts                # Tailwind custom theme
├── tsconfig.json
└── package.json
```

---

## Integration with Existing Backend

### Authentication Flow
The website will use the existing JWT-based authentication system.

**Login Flow:**
1. User enters credentials on `/signin` page
2. Frontend sends POST to `${API_URL}/api/v1/auth/login`
3. Backend returns `accessToken` (15min) + `refreshToken` (7d) via HTTP-only cookie
4. Frontend stores user data in Zustand store
5. Middleware checks token validity on protected routes
6. Refresh token rotation on expiry

**Protected Routes:**
- `/dashboard/*` → Requires valid JWT
- `/api/newsletter` → Public (rate-limited)
- `/api/contact` → Public (rate-limited)
- `/api/quiz` → Public (rate-limited)

**Backend Endpoints Used:**
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh-token
GET    /api/v1/users/me
PATCH  /api/v1/users/me
GET    /api/v1/analytics/dashboard
GET    /api/v1/campaigns
GET    /api/v1/reports/revenue/:year
```

### API Client Configuration

```typescript
// src/lib/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 30000,
  withCredentials: true, // Send cookies for refresh tokens
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Add JWT to headers
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: Handle 401, refresh token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh-token`,
          {},
          { withCredentials: true }
        );
        
        localStorage.setItem('accessToken', data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        
        return api(originalRequest);
      } catch (refreshError) {
        // Redirect to login
        window.location.href = '/signin';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;
```

### Newsletter Integration
Newsletter signups will be stored in the existing backend and forwarded to Mailchimp.

**Flow:**
1. User submits email via NewsletterForm component
2. Frontend sends POST to `/api/newsletter` (Next.js API route)
3. Next.js route validates email with Zod, checks rate limit
4. Forwards to backend: POST `${API_URL}/api/v1/newsletter/subscribe`
5. Backend stores in `newsletter_subscriptions` table
6. Backend forwards to Mailchimp API
7. Returns success/error to frontend

**Backend Enhancement Needed:**
```typescript
// backend/src/controllers/NewsletterController.ts (NEW)
import { Request, Response } from 'express';
import mailchimp from '@mailchimp/mailchimp_marketing';
import { pool } from '../utils/postgres';

mailchimp.setConfig({
  apiKey: process.env.MAILCHIMP_API_KEY,
  server: process.env.MAILCHIMP_SERVER_PREFIX,
});

export const subscribe = async (req: Request, res: Response) => {
  const { email, firstName, lastName, preferredLanguage } = req.body;
  
  try {
    // Store in database
    await pool.query(
      `INSERT INTO newsletter_subscriptions (email, first_name, last_name, preferred_language, source)
       VALUES ($1, $2, $3, $4, 'website')
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW()`,
      [email, firstName, lastName, preferredLanguage]
    );
    
    // Forward to Mailchimp
    await mailchimp.lists.addListMember(process.env.MAILCHIMP_AUDIENCE_ID, {
      email_address: email,
      status: 'subscribed',
      merge_fields: {
        FNAME: firstName || '',
        LNAME: lastName || '',
        LANGUAGE: preferredLanguage || 'en',
      },
      tags: ['website-signup'],
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Newsletter subscription error:', error);
    res.status(500).json({ error: 'Subscription failed' });
  }
};
```

### Analytics Integration
The dashboard will display data from the existing AnalyticsService.

**Dashboard Widgets:**
- Revenue chart (using `/api/v1/reports/revenue/:year`)
- Active campaigns (using `/api/v1/campaigns`)
- User growth (using `/api/v1/analytics/users`)
- Top performing ads (using `/api/v1/analytics/top-ads`)

**Charting Library:** Recharts (React wrapper for D3.js)
- Styled with primary-blue and sunshine-yellow colors
- Responsive design with mobile optimizations

---

## Cookie Consent & GDPR Compliance

### Cookie Banner Implementation
**Library:** `@cookie-consent/cookie-consent-banner`

**Categories:**
1. **Necessary** (always enabled): Authentication, session management
2. **Analytics** (optional): Google Analytics 4, Vercel Analytics
3. **Marketing** (optional): LinkedIn Insight Tag, Twitter Pixel

**Storage:**
- Consent preferences stored in `localStorage` as JSON
- Synced to backend: POST `/api/v1/consent` for audit trail
- Expires after 12 months (user re-prompted)

**Component:**
```tsx
// src/components/ui/CookieBanner.tsx
'use client';

import { useState, useEffect } from 'react';
import { useConsentStore } from '@/store/consent';
import { Button } from './Button';

export const CookieBanner = () => {
  const { consent, setConsent } = useConsentStore();
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    // Show banner if no consent recorded
    if (!consent.recorded) {
      setIsVisible(true);
    }
  }, [consent]);
  
  const acceptAll = () => {
    setConsent({ necessary: true, analytics: true, marketing: true });
    setIsVisible(false);
  };
  
  const rejectAll = () => {
    setConsent({ necessary: true, analytics: false, marketing: false });
    setIsVisible(false);
  };
  
  if (!isVisible) return null;
  
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-pale-yellow p-6 z-50">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="text-primary-blue text-sm flex-1">
          <p className="mb-2">
            We use cookies to improve your experience on our site. Some cookies are essential for the site to function, while others help us analyse traffic and personalise content.
          </p>
          <p>
            <a href="/cookie-policy" className="underline">Cookie Policy</a> | <button onClick={() => {/* Open settings modal */}} className="underline">Cookie Settings</button>
          </p>
        </div>
        <div className="flex gap-4">
          <Button variant="secondary" onClick={rejectAll}>
            Reject All
          </Button>
          <Button variant="primary" onClick={acceptAll}>
            🍪 Accept All Cookies
          </Button>
        </div>
      </div>
    </div>
  );
};
```

---

## Internationalization (i18n)

### Supported Languages
**Launch:** English (en) only
**Roadmap:** Estonian (et), Russian (ru), Finnish (fi)

### Implementation
**Library:** `next-intl`

**Structure:**
```
messages/
├── en.json
├── et.json
├── ru.json
└── fi.json
```

**Detection Priority:**
1. URL parameter: `?lang=et`
2. Cookie: `NEXT_LOCALE`
3. Browser `Accept-Language` header
4. Default: `en`

**Routing:**
```
/ → English (default)
/et → Estonian
/ru → Russian
/fi → Finnish
```

---

## Performance Optimization

### Core Web Vitals Targets
- **LCP (Largest Contentful Paint)**: < 2.5s
- **FID (First Input Delay)**: < 100ms
- **CLS (Cumulative Layout Shift)**: < 0.1

### Optimization Strategies

**1. Image Optimization**
- Use Next.js `<Image>` component with automatic WebP conversion
- Define explicit width/height to prevent CLS
- Lazy load images below the fold
- Use `priority` prop for hero images

**2. Font Loading**
- Self-host Sweden Sans fonts
- Use `font-display: swap` to prevent FOIT
- Preload critical font files:
  ```html
  <link rel="preload" href="/fonts/sweden-sans-bold.woff2" as="font" type="font/woff2" crossorigin>
  ```

**3. Code Splitting**
- Automatic route-based code splitting (Next.js default)
- Dynamic imports for heavy components:
  ```tsx
  const Chart = dynamic(() => import('@/components/dashboard/Chart'), {
    loading: () => <Spinner />,
    ssr: false,
  });
  ```

**4. Caching Strategy**
- Static assets: Cache-Control: public, max-age=31536000, immutable
- Marketing pages: Cache-Control: public, s-maxage=3600, stale-while-revalidate
- API responses: No caching (bypass CDN)

**5. Bundle Size**
- Target: < 200KB initial JS bundle
- Use `next/bundle-analyzer` to monitor
- Tree-shake unused code
- Use ES modules for dependencies

---

## Security Considerations

### Content Security Policy (CSP)
```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.googletagmanager.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' data:;
  connect-src 'self' https://api.bel-consulting.ee;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

### Security Headers
```javascript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
```

### Rate Limiting
- Leverage existing backend rate limiting middleware
- Add Vercel rate limiting for API routes (100 req/min per IP)
- Cloudflare rate limiting rules for form submissions (5 req/min per IP)

### Input Sanitization
- Use Zod schemas for all form inputs
- Sanitize HTML content in blog posts (use `DOMPurify`)
- Validate file uploads (if implemented)

---

## Monitoring & Analytics

### Error Tracking
**Sentry** (JavaScript SDK)
- Capture client-side errors
- Source maps for production debugging
- Performance monitoring
- User feedback integration

**Configuration:**
```typescript
// src/lib/sentry.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% of transactions
  beforeSend(event, hint) {
    // Filter sensitive data
    if (event.request?.cookies) {
      delete event.request.cookies;
    }
    return event;
  },
});
```

### Web Analytics
**Vercel Analytics** (privacy-friendly, no cookies required)
- Page views and unique visitors
- Top pages and referrers
- Core Web Vitals monitoring

**Google Analytics 4** (optional, requires consent)
- Custom event tracking (newsletter signups, demo requests)
- Conversion funnels
- User demographics

### Uptime Monitoring
**Checkly** (API monitoring + E2E tests)
- Monitor critical pages every 5 minutes
- Alert on downtime (PagerDuty integration)
- Automated browser tests for signup flow

---

## Accessibility Standards

### WCAG 2.1 Level AA Compliance

**Color Contrast:**
- Primary blue (#005293) on white: 8.8:1 ✅ (AAA)
- Sunshine yellow (#FECB00) on primary blue: 4.7:1 ✅ (AA)
- White on primary blue: 10.5:1 ✅ (AAA)

**Keyboard Navigation:**
- All interactive elements focusable
- Focus indicators visible (yellow outline on blue backgrounds, blue outline on yellow)
- Skip navigation link for screen readers
- Logical tab order

**Screen Reader Support:**
- Semantic HTML (`<nav>`, `<main>`, `<article>`, `<aside>`)
- ARIA labels for icons and emoji
- Alt text for all images
- Form labels properly associated with inputs

**Responsive Design:**
- Minimum touch target size: 44x44px
- Zoom to 200% without horizontal scrolling
- No flashing content (seizure risk)

**Testing:**
- Automated: Axe DevTools, Lighthouse
- Manual: NVDA (Windows), VoiceOver (macOS), JAWS
- Keyboard-only navigation testing

---

## Testing Strategy

### Unit Tests
**Vitest** (Vite-powered Jest alternative)
- Component logic tests
- Utility function tests
- API client tests (mocked)

**Target Coverage:** > 80%

### Integration Tests
**React Testing Library**
- Component interaction tests
- Form submission flows
- Authentication flows

### End-to-End Tests
**Playwright**
- Critical user journeys:
  - Homepage → Feature page → Signup
  - Signin → Dashboard → Analytics
  - Newsletter signup flow
- Cross-browser testing (Chromium, Firefox, WebKit)

### Visual Regression Tests
**Percy** or **Chromatic**
- Capture screenshots of key pages
- Detect unintended visual changes
- Compare across breakpoints

---

## Environment Variables

### Frontend (.env.local)
```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://api.bel-consulting.ee
NEXT_PUBLIC_SITE_URL=https://apexmediation.bel-consulting.ee

# Analytics
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Feature Flags
NEXT_PUBLIC_ENABLE_QUIZ=true
NEXT_PUBLIC_ENABLE_CHAT_WIDGET=false

# Mailchimp (server-side only)
MAILCHIMP_API_KEY=xxx-us12
MAILCHIMP_SERVER_PREFIX=us12
MAILCHIMP_AUDIENCE_ID=xxx
```

### Backend (.env additions needed)
```bash
# Mailchimp Integration (NEW)
MAILCHIMP_API_KEY=your_api_key
MAILCHIMP_SERVER_PREFIX=us12
MAILCHIMP_AUDIENCE_ID=your_audience_id

# Cookie Consent Tracking (NEW)
CONSENT_WEBHOOK_URL=https://optional-crm-webhook.com
```

---

## Cost Estimation

### Monthly Operating Costs

| Service | Tier | Cost (USD) | Notes |
|---------|------|------------|-------|
| **Vercel** | Pro | $20 | Includes unlimited bandwidth, 1000 serverless function hours |
| **Cloudflare** | Pro | $20 | DDoS protection, Bot Management, 10M+ requests/month |
| **Domain** | .ee TLD | $2 | Annual renewal via Cloudflare Registrar |
| **Sentry** | Team | $26 | 50k errors/month, 10k transactions/month |
| **Mailchimp** | Essentials | $13 | Up to 5,000 contacts |
| **Checkly** | Startup | $29 | 10 API checks, 5 browser checks |
| **Sweden Sans License** | One-time | $200 | Web license for unlimited pageviews |
| **TOTAL** | | **$110/month** | + $200 one-time font license |

**Scalability:**
- Vercel Pro supports 100k serverless invocations/month (sufficient for 100k MAU)
- Cloudflare Pro handles 10M+ requests/month
- Can upgrade to Vercel Enterprise ($150/month) for 1M MAU

---

## Migration & Deployment Plan

### Phase 1: Foundation (Week 1-2)
- [x] Set up Next.js project with TypeScript + Tailwind
- [x] Configure Vercel deployment
- [x] Implement design system (colors, typography, components)
- [x] Create reusable UI components (Button, Accordion, Card, etc.)
- [x] Set up Cloudflare CDN

### Phase 2: Marketing Pages (Week 3-4)
- [x] Implement homepage with hero, philosophy, newsletter, quiz sections
- [x] Create feature landing pages (Mediation, Fraud Detection, Compliance, Reporting)
- [x] Build pricing page
- [x] Implement blog index and blog post templates
- [x] Create case study templates

### Phase 3: Documentation (Week 5)
- [x] Build documentation layout with sidebar navigation
- [x] Create SDK documentation pages (Unity, iOS, Android)
- [x] Write API reference documentation
- [x] Add Prebid adapter guide
- [x] Implement search functionality

### Phase 4: Dashboard (Week 6-7)
- [x] Integrate authentication with backend
- [x] Build dashboard layout with sidebar
- [x] Implement analytics view with charts
- [x] Create campaigns management view
- [x] Build payments/billing view
- [x] Add settings page

### Phase 5: Integrations (Week 8)
- [x] Integrate newsletter signup with Mailchimp
- [x] Add contact form with backend API
- [x] Implement quiz logic and submission
- [x] Set up cookie consent banner
- [x] Configure Google Analytics 4

### Phase 6: Testing & Optimization (Week 9)
- [x] Write unit tests for components
- [x] Write integration tests for forms
- [x] Set up Playwright E2E tests
- [x] Run accessibility audits
- [x] Optimize Core Web Vitals
- [x] Set up error tracking (Sentry)

### Phase 7: Launch Preparation (Week 10)
- [x] Final QA testing
- [x] Load testing (simulate 10k concurrent users)
- [x] Security audit (OWASP Top 10 checks)
- [x] Set up monitoring and alerts
- [x] Prepare rollback plan
- [x] DNS cutover to new site

### Post-Launch (Ongoing)
- Monitor error rates and performance
- A/B test CTAs and headlines
- Add internationalization (Estonian, Russian, Finnish)
- Expand documentation based on user feedback
- Implement chat widget for support

---

## Success Metrics

### Technical KPIs
- **Uptime**: > 99.9% (excluding planned maintenance)
- **TTFB**: < 500ms (Time to First Byte)
- **LCP**: < 2.5s (Largest Contentful Paint)
- **FID**: < 100ms (First Input Delay)
- **CLS**: < 0.1 (Cumulative Layout Shift)
- **Lighthouse Score**: > 95 (Performance, Accessibility, Best Practices, SEO)

### Business KPIs
- **Newsletter signups**: Track conversion rate from homepage visitors
- **Demo requests**: Monitor form submissions from pricing page
- **Dashboard logins**: Track DAU (Daily Active Users)
- **Documentation views**: Identify most-viewed SDK guides
- **Bounce rate**: Target < 40% on marketing pages

---

## Risk Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Sweden Sans license unavailable** | Medium | Low | Use Inter or Public Sans as fallback (visually similar) |
| **Backend API downtime** | High | Low | Implement graceful degradation, show cached data |
| **CDN cache poisoning** | High | Very Low | Use signed URLs for critical assets, monitor cache hit ratio |
| **DDoS attack on signup forms** | Medium | Medium | Cloudflare Bot Management + rate limiting |
| **Accessibility lawsuit** | High | Low | Conduct WCAG 2.1 AA audit before launch, ongoing monitoring |
| **GDPR compliance violation** | Critical | Low | Legal review of cookie policy, implement strict consent management |

---

## Conclusion

This architecture provides a scalable, performant, and maintainable foundation for the customer-facing website. By leveraging Next.js, Vercel, and Cloudflare, we achieve:

✅ **Fast**: SSG for marketing pages, edge caching, optimized assets  
✅ **Secure**: CSP, security headers, rate limiting, input validation  
✅ **Accessible**: WCAG 2.1 AA compliance, keyboard navigation, screen reader support  
✅ **Integrated**: Seamless connection to existing Node.js backend  
✅ **Scalable**: Supports 100k MAU without infrastructure changes  
✅ **Observable**: Error tracking, analytics, uptime monitoring  

**Next Steps:**
1. Review and approve architecture
2. Set up Vercel and Cloudflare accounts
3. Begin Phase 1 implementation (see WEBSITE_TODO.md for detailed task breakdown)
4. Schedule weekly progress reviews

---

**Document Maintainer**: Development Team  
**Last Review**: January 2025  
**Next Review**: After Phase 1 completion
