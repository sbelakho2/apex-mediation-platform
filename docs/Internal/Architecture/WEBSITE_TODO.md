# Customer-Facing Website Implementation Todo
**ApexMediation Platform – Bel Consulting OÜ / Starz Energies**

*Generated from Website.docx design specifications*  
*Last Updated: January 2025*

---

## Overview

This document breaks down the complete website implementation into actionable tasks with priorities, estimates, and dependencies. All tasks are derived from the design specifications in Website.docx and adapted to integrate with our existing backend infrastructure.

**Total Estimated Effort:** 400 hours (10 weeks @ 40 hrs/week, 1 developer)

---

## Phase 1: Foundation & Setup (Week 1-2, 80 hours)

### 1.1 Project Initialization
- [ ] **Create Next.js project structure** (2 hours)
  - Run `npx create-next-app@latest website --typescript --tailwind --app`
  - Configure project for App Router
  - Set up folder structure (app/, components/, lib/, store/)
  - Priority: **CRITICAL** | Dependency: None

- [ ] **Configure TypeScript** (1 hour)
  - Set up `tsconfig.json` with strict mode
  - Add path aliases (`@/components`, `@/lib`, etc.)
  - Install type definitions for all dependencies
  - Priority: **CRITICAL** | Dependency: 1.1.1

- [ ] **Install core dependencies** (2 hours)
  ```bash
  npm install @headlessui/react framer-motion zustand axios
  npm install react-hook-form zod lucide-react
  npm install recharts date-fns
  npm install -D @types/node @types/react @types/react-dom
  ```
  - Priority: **CRITICAL** | Dependency: 1.1.1

- [ ] **Set up Tailwind custom configuration** (3 hours)
  - Define color palette in `tailwind.config.ts`:
    ```typescript
    colors: {
      'primary-blue': '#005293',
      'sunshine-yellow': '#FECB00',
      'pale-yellow': '#FFD481',
      'cream': '#E8E3D1',
      'accent-red': '#C04437',
      'success-green': '#5BAA2A'
    }
    ```
  - Configure font family for Sweden Sans
  - Set up breakpoints (768px, 992px)
  - Add custom spacing scale
  - Priority: **CRITICAL** | Dependency: 1.1.3

- [ ] **Acquire and configure Sweden Sans font** (4 hours)
  - Purchase web license from Svedin & Co (or identify fallback)
  - Download `.woff2` files (Book, Bold weights)
  - Place in `/public/fonts/` directory
  - Create font-face declarations in `globals.css`
  - Test font loading with `font-display: swap`
  - **Fallback:** Use Inter or Public Sans if licensing unavailable
  - Priority: **HIGH** | Dependency: None

- [ ] **Create design system constants** (2 hours)
  - `src/lib/constants.ts`:
    - Color hex values
    - Typography scales (H1: 5rem desktop → 2rem mobile)
    - Spacing units
    - Border radius (0px for squared corners)
    - Letter spacing (-1.5px for H1, -0.4px for body)
    - Line heights
  - Priority: **HIGH** | Dependency: 1.1.4

### 1.2 Development Environment
- [ ] **Set up ESLint and Prettier** (1 hour)
  - Configure ESLint with Next.js recommended rules
  - Add Prettier for code formatting
  - Set up pre-commit hooks with Husky
  - Priority: **MEDIUM** | Dependency: 1.1.1

- [ ] **Configure environment variables** (1 hour)
  - Create `.env.local` template
  - Document required variables:
    - `NEXT_PUBLIC_API_URL`
    - `NEXT_PUBLIC_SITE_URL`
    - `NEXT_PUBLIC_GA_MEASUREMENT_ID`
    - `NEXT_PUBLIC_SENTRY_DSN`
  - Add `.env.example` to git
  - Priority: **HIGH** | Dependency: None

- [ ] **Set up Vercel project** (2 hours)
  - Create Vercel account (if not exists)
  - Link GitHub repository
  - Configure deployment settings
  - Add environment variables to Vercel dashboard
  - Set up preview deployments for PRs
  - Priority: **CRITICAL** | Dependency: 1.1.1

- [ ] **Configure Cloudflare CDN** (3 hours)
  - Set up Cloudflare account
  - Add domain `apexmediation.bel-consulting.ee`
  - Configure DNS records pointing to Vercel
  - Enable Cloudflare Proxy
  - Set up cache rules:
    - Static assets: 1 year cache
    - Marketing pages: 1 hour cache
    - API routes: bypass cache
  - Enable Brotli compression
  - Priority: **HIGH** | Dependency: 1.2.3

- [ ] **Set up GitHub Actions CI/CD** (4 hours)
  - Create `.github/workflows/deploy.yml`
  - Configure steps:
    - Checkout, Node setup, install dependencies
    - Lint, type-check, test
    - Build Next.js
    - Deploy to Vercel
  - Set up separate workflows for `main` (production) and `develop` (staging)
  - Add required secrets to GitHub
  - Priority: **HIGH** | Dependency: 1.2.3

### 1.3 Core UI Components
- [ ] **Create Button component** (3 hours)
  - `src/components/ui/Button.tsx`
  - Variants: `primary` (yellow bg, blue text), `secondary` (blue bg, white text)
  - States: default, hover, focus, disabled
  - Hover: darken color, add small shadow
  - Padding: vertical 0.8rem, horizontal 1.4rem
  - Font weight: bold, uppercase
  - Square corners (border-radius: 0)
  - Priority: **CRITICAL** | Dependency: 1.1.4

- [ ] **Create Link component** (2 hours)
  - `src/components/ui/Link.tsx`
  - Custom styling: no underline, colored by context
  - Text shadow effect (offset 1-2px in contrasting color)
  - Hover: remove shadow, add underline
  - Props: `href`, `variant` (blue-on-yellow, yellow-on-blue, white-on-blue)
  - Priority: **HIGH** | Dependency: 1.1.4

- [ ] **Create Card component** (2 hours)
  - `src/components/ui/Card.tsx`
  - Squared corners, generous padding (2rem)
  - Background color variants (blue, yellow, cream, white)
  - Bleed to edge on mobile, contained in grid on desktop
  - Priority: **HIGH** | Dependency: 1.1.4

- [ ] **Create Input component** (3 hours)
  - `src/components/ui/Input.tsx`
  - Minimal styling: 1px blue border, 0.5rem padding, no background
  - Label in small uppercase (yellow on dark, blue on light)
  - Placeholder text in pale tint
  - Error state with accent-red border
  - Priority: **HIGH** | Dependency: 1.1.4

- [ ] **Create Accordion component** (4 hours)
  - `src/components/ui/Accordion.tsx`
  - Use Headless UI Disclosure component
  - Header row: same background as parent, chevron icon (rotates on open)
  - Content panel: lighter shade of same color
  - Separated by thin colored lines
  - Zero border radius
  - Keyboard accessible (Enter/Space to toggle)
  - Priority: **MEDIUM** | Dependency: 1.1.3

- [ ] **Create WaveDivider SVG component** (3 hours)
  - `src/components/marketing/WaveDivider.tsx`
  - Organic wavy edge (full width)
  - Jittered baseline (scalloped edge effect)
  - Used between yellow top bar and blue hero section
  - Responsive (scales with viewport)
  - Hide from screen readers (`aria-hidden="true"`)
  - Priority: **MEDIUM** | Dependency: None

### 1.4 Testing Setup
- [ ] **Install Vitest** (2 hours)
  - `npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom`
  - Configure `vitest.config.ts`
  - Create test utilities (`src/__tests__/utils.tsx`)
  - Write sample test for Button component
  - Priority: **MEDIUM** | Dependency: 1.3.1

- [ ] **Install Playwright** (3 hours)
  - `npm install -D @playwright/test`
  - Run `npx playwright install`
  - Configure `playwright.config.ts` with baseURL, browsers, timeout
  - Create sample E2E test for homepage
  - Priority: **MEDIUM** | Dependency: 1.2.3

---

## Phase 2: Marketing Pages (Week 3-4, 80 hours)

### 2.1 Global Layout Components
- [ ] **Create Header component** (6 hours)
  - `src/components/marketing/Header.tsx`
  - **Top yellow bar** (60px high):
    - Left: Logo "AD ENGINE" in uppercase blue
    - Right: Contextual message + "Change region" link
    - Close/dismiss icon
    - Wavy bottom border (use WaveDivider)
  - **Primary navigation** (below wave, in hero section):
    - Horizontal row, uppercase yellow text on blue background
    - Links: "Plan your monetization" (dropdown), "Integrate & build" (dropdown), "Resources", "Pricing", "Sign in / Register"
    - Search icon on far right
    - Hamburger menu on tablet/mobile
  - Responsive: collapse to hamburger menu < 992px
  - Priority: **CRITICAL** | Dependency: 1.3.6

- [ ] **Create Footer component** (4 hours)
  - `src/components/marketing/Footer.tsx`
  - Compact modules separated by thin lines
  - Sections: About, Legal, Community, Other Resources, Social Icons
  - Color scheme: yellow text on blue background
  - Social icons: LinkedIn, X/Twitter, YouTube, GitHub (yellow on blue)
  - Priority: **HIGH** | Dependency: 1.1.4

- [ ] **Create marketing layout** (2 hours)
  - `src/app/(marketing)/layout.tsx`
  - Wrap all marketing pages with Header + Footer
  - Include CookieBanner
  - Priority: **CRITICAL** | Dependency: 2.1.1, 2.1.2

- [ ] **Create CookieBanner component** (5 hours)
  - `src/components/ui/CookieBanner.tsx`
  - Pale yellow background, blue text
  - Two-paragraph explanation of cookie usage
  - Links: "Cookie Policy", "Cookie settings"
  - Buttons: "Accept all cookies" (primary, with 🍪 emoji), "Reject all" (secondary, danger color)
  - Store consent in localStorage + sync to backend
  - Priority: **HIGH** | Dependency: 1.3.1

### 2.2 Homepage Sections
- [ ] **Create Hero component** (8 hours)
  - `src/components/marketing/Hero.tsx`
  - Full-viewport panel (min-height: 100vh)
  - Deep blue background (#005293)
  - **Headline**: Large yellow text (5rem desktop, 3rem tablet, 2rem mobile)
    - Bold weight, uppercase
    - Letter-spacing: -1.5px
    - Two lines: "✌️ GROW & MONETISE" / "THE ETHICAL WAY"
    - Emoji inline with text (aria-label for accessibility)
  - **Subheadline**: Optional animation cycling through adjectives ("Fast", "Transparent", "Safe")
    - "Pause animation" control (white text)
  - **CTA**: Upper right corner, yellow text "→ Request a demo"
  - Priority: **CRITICAL** | Dependency: 1.1.4, 1.3.1

- [ ] **Create "Popular right now" section** (4 hours)
  - `src/components/marketing/HighlightSection.tsx`
  - Small uppercase yellow text heading
  - Two large callout lines (stacked, separated by yellow rules)
  - Examples:
    - "SDK VERSION 5 RELEASED 🎉 LEARN HOW TO UPGRADE"
    - "GET INSIDER MONETISATION TIPS STRAIGHT TO YOUR INBOX"
  - Link entire callout to respective pages
  - Priority: **MEDIUM** | Dependency: 1.1.4

- [ ] **Create PhilosophySection component** (5 hours)
  - `src/components/marketing/PhilosophySection.tsx`
  - Heading: "Our Philosophy ✌️" (yellow on blue)
  - Large full-bleed image on one side (abstract illustration or photo)
  - Ample whitespace on opposite side
  - Text describing brand philosophy (fairness, equality, innovation)
  - Responsive: image below text on mobile
  - Priority: **HIGH** | Dependency: 1.1.4

- [ ] **Create NewsletterPanel component** (6 hours)
  - `src/components/marketing/NewsletterPanel.tsx`
  - Bright yellow background (#FECB00)
  - Heading: "Get tips, deadlines and product updates straight to your inbox ✌️" (blue text)
  - Newsletter signup form:
    - Email input field
    - Optional: First name, Last name fields
    - Submit button (blue bg, white text)
  - Form validation with Zod
  - Integration with backend API route
  - Success/error messages
  - Priority: **HIGH** | Dependency: 1.3.4, 3.1.1

- [ ] **Create QuizCallout component** (4 hours)
  - `src/components/marketing/QuizCallout.tsx`
  - Blue text on blue background with yellow arrow button
  - Teaser text: "Is our ad stack right for your business? Take our quiz and find out now."
  - Link to quiz page (implement later)
  - Priority: **MEDIUM** | Dependency: 1.3.1

- [ ] **Create CaseStudyTeaser component** (5 hours)
  - `src/components/marketing/CaseStudyTeaser.tsx`
  - Featured case study with image thumbnail
  - Image framed in yellow border
  - Headline in large yellow text (right-aligned)
  - Example: "Meet the publishers who are already here"
  - Left side empty (negative space)
  - Thin horizontal rule underneath
  - Link entire panel to case study page
  - Priority: **MEDIUM** | Dependency: 1.3.3

- [ ] **Assemble homepage** (4 hours)
  - `src/app/(marketing)/page.tsx`
  - Combine all sections in order:
    1. Hero
    2. HighlightSection
    3. PhilosophySection
    4. NewsletterPanel
    5. QuizCallout
    6. CaseStudyTeaser
  - Test responsive behavior at all breakpoints
  - Priority: **CRITICAL** | Dependency: 2.2.1-2.2.6

### 2.3 Feature Landing Pages
- [ ] **Create FeatureLayout component** (3 hours)
  - `src/components/marketing/FeatureLayout.tsx`
  - Reusable layout for feature pages
  - Hero section with blue bg + yellow heading
  - Alternating panels (blue/yellow/cream) for subtopics
  - Priority: **HIGH** | Dependency: 2.2.1

- [ ] **Create Mediation & Auction page** (4 hours)
  - `src/app/(marketing)/features/mediation/page.tsx`
  - Hero: "Mediation & Auction 🎯" (yellow on blue)
  - Sections:
    - How mediation works (accordion with features)
    - Supported ad networks
    - Integration guide link
  - Priority: **HIGH** | Dependency: 2.3.1, 1.3.5

- [ ] **Create Ad Quality & Fraud page** (4 hours)
  - `src/app/(marketing)/features/fraud-detection/page.tsx`
  - Hero: "Ad Quality & Fraud Detection 🛡️"
  - Sections:
    - Real-time fraud detection
    - Quality scoring system
    - Reporting tools
  - Priority: **HIGH** | Dependency: 2.3.1

- [ ] **Create Privacy & Compliance page** (4 hours)
  - `src/app/(marketing)/features/compliance/page.tsx`
  - Hero: "Privacy & Compliance ✅"
  - Sections:
    - GDPR compliance
    - Estonian e-MTA integration
    - Data retention policies
  - Priority: **HIGH** | Dependency: 2.3.1

- [ ] **Create Data & Reporting page** (4 hours)
  - `src/app/(marketing)/features/reporting/page.tsx`
  - Hero: "Data & Reporting 📊"
  - Sections:
    - Real-time analytics
    - Custom reports
    - Excel export functionality
  - Priority: **HIGH** | Dependency: 2.3.1

### 2.4 Pricing Page
- [ ] **Create PricingCard component** (4 hours)
  - `src/components/marketing/PricingCard.tsx`
  - Pale yellow box on blue background
  - Blue text outlining plan name, features, CTA button
  - Large numbers for pricing
  - Small note for revenue share percentage
  - Priority: **HIGH** | Dependency: 1.3.3

- [ ] **Create pricing page** (4 hours)
  - `src/app/(marketing)/pricing/page.tsx`
  - Display 3 tier cards (Starter, Growth, Enterprise)
  - Comparison table below cards
  - FAQ accordion
  - Priority: **HIGH** | Dependency: 2.4.1, 1.3.5

### 2.5 Blog & Case Studies
- [ ] **Create BlogCard component** (3 hours)
  - `src/components/content/BlogCard.tsx`
  - Blue background, yellow title
  - Thumbnail photo framed in yellow outline
  - Hover: invert color scheme
  - Priority: **MEDIUM** | Dependency: 1.3.3

- [ ] **Create blog index page** (4 hours)
  - `src/app/(content)/blog/page.tsx`
  - Grid layout displaying BlogCard teasers
  - Filter by category/tag
  - Pagination
  - Priority: **MEDIUM** | Dependency: 2.5.1

- [ ] **Create blog post template** (5 hours)
  - `src/app/(content)/blog/[slug]/page.tsx`
  - Cream background (#E8E3D1) for readability
  - Blue headings, black body text
  - Yellow callouts for quotes/important figures
  - Author info, publish date
  - Related posts section
  - Priority: **MEDIUM** | Dependency: 1.1.4

- [ ] **Create case study template** (4 hours)
  - `src/app/(content)/case-studies/[slug]/page.tsx`
  - Similar to blog post but with:
    - Company logo
    - Statistics callout boxes
    - Testimonial quote
  - Priority: **LOW** | Dependency: 2.5.3

---

## Phase 3: Backend Integration (Week 5, 40 hours)

### 3.1 API Client Setup
- [ ] **Create API client utility** (4 hours)
  - `src/lib/api.ts`
  - Axios instance with:
    - Base URL from env var
    - 30s timeout
    - withCredentials for cookies
    - Authorization header with JWT
  - Request interceptor: add token from localStorage
  - Response interceptor: handle 401, refresh token
  - Priority: **CRITICAL** | Dependency: 1.2.2

- [ ] **Create TypeScript types for API responses** (3 hours)
  - `src/types/api.ts`
  - Define interfaces for:
    - User (matches backend User model)
    - Campaign, Ad, Analytics data
    - Newsletter subscription response
    - Contact form response
  - Priority: **HIGH** | Dependency: None

- [ ] **Create Zustand auth store** (3 hours)
  - `src/store/auth.ts`
  - State: `user`, `isAuthenticated`, `isLoading`
  - Actions: `login`, `logout`, `refreshToken`, `setUser`
  - Persist to localStorage
  - Priority: **CRITICAL** | Dependency: 3.1.1

### 3.2 Newsletter Integration
- [ ] **Create NewsletterForm component** (4 hours)
  - `src/components/forms/NewsletterForm.tsx`
  - React Hook Form + Zod validation
  - Fields: email (required), firstName (optional), lastName (optional)
  - Submit to Next.js API route `/api/newsletter`
  - Loading state, success message, error handling
  - Priority: **HIGH** | Dependency: 1.3.4, 3.1.1

- [ ] **Create Next.js API route for newsletter** (3 hours)
  - `src/app/api/newsletter/route.ts`
  - Validate input with Zod
  - Rate limiting (5 requests/min per IP)
  - Forward to backend: POST `${API_URL}/api/v1/newsletter/subscribe`
  - Return success/error to frontend
  - Priority: **HIGH** | Dependency: 3.1.1

- [ ] **Create backend newsletter controller** (4 hours)
  - `backend/src/controllers/NewsletterController.ts` (NEW)
  - Store in `newsletter_subscriptions` table
  - Forward to Mailchimp API
  - Handle duplicates (update instead of error)
  - Priority: **HIGH** | Dependency: 3.2.2

- [ ] **Create backend newsletter route** (1 hour)
  - `backend/src/routes/newsletter.ts` (NEW)
  - POST `/api/v1/newsletter/subscribe`
  - Apply rate limiting middleware
  - Priority: **HIGH** | Dependency: 3.2.3

- [ ] **Install Mailchimp SDK in backend** (1 hour)
  - `cd backend && npm install @mailchimp/mailchimp_marketing`
  - Add env vars: `MAILCHIMP_API_KEY`, `MAILCHIMP_SERVER_PREFIX`, `MAILCHIMP_AUDIENCE_ID`
  - Priority: **HIGH** | Dependency: 3.2.3

### 3.3 Contact Form
- [ ] **Create ContactForm component** (4 hours)
  - `src/components/forms/ContactForm.tsx`
  - Fields: name, email, company, message
  - Zod validation
  - Submit to `/api/contact`
  - Priority: **MEDIUM** | Dependency: 1.3.4

- [ ] **Create Next.js API route for contact** (2 hours)
  - `src/app/api/contact/route.ts`
  - Validate input
  - Forward to backend or send email directly
  - Priority: **MEDIUM** | Dependency: 3.1.1

- [ ] **Create contact page** (2 hours)
  - `src/app/(marketing)/contact/page.tsx`
  - Hero, ContactForm, office address, support email
  - Priority: **MEDIUM** | Dependency: 3.3.1

### 3.4 Authentication Flow
- [ ] **Create signin page** (4 hours)
  - `src/app/(marketing)/signin/page.tsx`
  - Email + password form
  - "Forgot password?" link
  - "Don't have an account? Sign up" link
  - Submit to backend `/api/v1/auth/login`
  - Store JWT in localStorage + user in Zustand
  - Redirect to dashboard on success
  - Priority: **CRITICAL** | Dependency: 3.1.1, 3.1.3

- [ ] **Create signup page** (5 hours)
  - `src/app/(marketing)/signup/page.tsx`
  - Fields: firstName, lastName, email, password, confirmPassword, company
  - Zod validation (password strength, email format)
  - Submit to backend `/api/v1/auth/register`
  - Auto-login after successful registration
  - Priority: **CRITICAL** | Dependency: 3.1.1

- [ ] **Create middleware for protected routes** (3 hours)
  - `src/middleware.ts`
  - Check JWT validity for `/dashboard/*` routes
  - Redirect to `/signin` if not authenticated
  - Refresh token if expired
  - Priority: **CRITICAL** | Dependency: 3.1.3

### 3.5 Cookie Consent Management
- [ ] **Create Zustand consent store** (2 hours)
  - `src/store/consent.ts`
  - State: `necessary`, `analytics`, `marketing`, `recorded`
  - Actions: `setConsent`, `loadConsent`
  - Persist to localStorage with 12-month expiry
  - Priority: **HIGH** | Dependency: 3.1.1

- [ ] **Create Next.js API route for consent** (2 hours)
  - `src/app/api/consent/route.ts`
  - Store consent preferences in backend for audit trail
  - POST `/api/v1/consent` (backend endpoint)
  - Priority: **MEDIUM** | Dependency: 3.1.1

- [ ] **Implement consent-gated analytics** (3 hours)
  - Wrap Google Analytics 4 initialization in consent check
  - Only load GA script if `analytics: true`
  - Create `src/lib/analytics.ts` utility
  - Priority: **MEDIUM** | Dependency: 3.5.1

---

## Phase 4: Documentation (Week 6, 40 hours)

### 4.1 Documentation Layout
- [ ] **Create docs layout with sidebar** (6 hours)
  - `src/app/(docs)/layout.tsx`
  - Two-column layout (nav left, content right) on desktop
  - Single column on mobile with collapsible sidebar
  - Sidebar navigation tree
  - Cream background (#E8E3D1) for readability
  - Priority: **HIGH** | Dependency: 2.1.1

- [ ] **Create sidebar navigation component** (4 hours)
  - `src/components/docs/Sidebar.tsx`
  - Nested navigation tree
  - Active page highlight
  - Collapsible sections
  - Search input at top
  - Priority: **HIGH** | Dependency: 4.1.1

- [ ] **Create TableOfContents component** (3 hours)
  - `src/components/docs/TableOfContents.tsx`
  - Auto-generate from page headings
  - Sticky positioning on desktop
  - Highlight current section on scroll
  - Priority: **MEDIUM** | Dependency: 4.1.1

### 4.2 SDK Documentation Pages
- [ ] **Create Unity SDK documentation** (6 hours)
  - `src/app/(docs)/docs/unity-sdk/page.tsx`
  - Sections:
    - Installation (Package Manager, Unity Asset Store)
    - Configuration (API keys, build settings)
    - Integration steps (code examples)
    - API reference (classes, methods)
    - Troubleshooting
  - Code blocks with syntax highlighting (use `react-syntax-highlighter`)
  - Priority: **HIGH** | Dependency: 4.1.1

- [ ] **Create iOS SDK documentation** (6 hours)
  - `src/app/(docs)/docs/ios-sdk/page.tsx`
  - Sections:
    - Installation (Swift Package Manager, CocoaPods)
    - Swift/Objective-C examples
    - Privacy manifest (iOS 17+)
    - App Tracking Transparency integration
  - Priority: **HIGH** | Dependency: 4.1.1

- [ ] **Create Android SDK documentation** (6 hours)
  - `src/app/(docs)/docs/android-sdk/page.tsx`
  - Sections:
    - Installation (Gradle, Maven)
    - Kotlin/Java examples
    - Permissions setup
    - ProGuard rules
  - Priority: **HIGH** | Dependency: 4.1.1

- [ ] **Create API Reference documentation** (5 hours)
  - `src/app/(docs)/docs/api-reference/page.tsx`
  - Generate from OpenAPI spec (if available)
  - Sections:
    - Authentication
    - Endpoints (grouped by resource)
    - Request/response examples
    - Rate limits
    - Error codes
  - Priority: **HIGH** | Dependency: 4.1.1

- [ ] **Create Prebid Adapter guide** (4 hours)
  - `src/app/(docs)/docs/prebid-adapter/page.tsx`
  - How to integrate our adapter with Prebid.js
  - Configuration options
  - Troubleshooting common issues
  - Priority: **MEDIUM** | Dependency: 4.1.1

---

## Phase 5: Dashboard (Week 7-8, 80 hours)

### 5.1 Dashboard Layout
- [ ] **Create dashboard layout** (6 hours)
  - `src/app/(dashboard)/layout.tsx`
  - Blue navigation sidebar on desktop (collapsed/expanded states)
  - Top bar on mobile with hamburger menu
  - Cream backdrop for content area
  - Nav items: Dashboard, Analytics, Campaigns, Payments, Settings, Logout
  - Priority: **CRITICAL** | Dependency: 3.4.3

- [ ] **Create DashboardSidebar component** (5 hours)
  - `src/components/dashboard/Sidebar.tsx`
  - Logo at top
  - Navigation links with icons (Lucide)
  - Active state highlight (yellow)
  - User avatar + name at bottom
  - Logout button
  - Priority: **CRITICAL** | Dependency: 5.1.1

- [ ] **Create TopBar component for mobile** (3 hours)
  - `src/components/dashboard/TopBar.tsx`
  - Logo, hamburger menu, notifications icon
  - Slide-out navigation panel
  - Priority: **HIGH** | Dependency: 5.1.1

### 5.2 Dashboard Main View
- [ ] **Create MetricCard component** (4 hours)
  - `src/components/dashboard/MetricCard.tsx`
  - Display single metric (e.g., "Revenue", "Active Campaigns")
  - Large number, label, trend indicator (↑ +12%)
  - Color-coded: green for positive, red for negative
  - Priority: **HIGH** | Dependency: 1.3.3

- [ ] **Create Chart component** (6 hours)
  - `src/components/dashboard/Chart.tsx`
  - Wrapper for Recharts (LineChart, BarChart, PieChart)
  - Styled with primary-blue and sunshine-yellow colors
  - Responsive design
  - Tooltip with formatted values
  - Priority: **HIGH** | Dependency: 5.2.1

- [ ] **Create dashboard overview page** (8 hours)
  - `src/app/(dashboard)/dashboard/page.tsx`
  - Grid of MetricCards:
    - Total Revenue (current month)
    - Active Campaigns
    - Impressions (today)
    - eCPM (effective cost per mille)
  - Revenue chart (last 30 days)
  - Top performing ads table
  - Recent activity feed
  - Fetch data from backend `/api/v1/analytics/dashboard`
  - Priority: **CRITICAL** | Dependency: 5.2.1, 5.2.2, 3.1.1

### 5.3 Analytics View
- [ ] **Create date range picker component** (4 hours)
  - `src/components/dashboard/DateRangePicker.tsx`
  - Presets: Today, Last 7 days, Last 30 days, This month, Custom range
  - Calendar popup (use `react-day-picker`)
  - Priority: **HIGH** | Dependency: None

- [ ] **Create analytics page** (10 hours)
  - `src/app/(dashboard)/dashboard/analytics/page.tsx`
  - Date range picker
  - Filter by campaign, ad format, country
  - Charts:
    - Revenue over time (line chart)
    - Impressions by country (bar chart)
    - Ad format distribution (pie chart)
  - Export button (download CSV)
  - Fetch data from `/api/v1/analytics/query`
  - Priority: **HIGH** | Dependency: 5.3.1, 5.2.2, 3.1.1

### 5.4 Campaigns View
- [ ] **Create CampaignTable component** (6 hours)
  - `src/components/dashboard/CampaignTable.tsx`
  - Sortable columns (name, status, impressions, revenue)
  - Row actions: Edit, Pause/Resume, Delete
  - Pagination
  - Priority: **HIGH** | Dependency: 5.2.1

- [ ] **Create campaigns page** (6 hours)
  - `src/app/(dashboard)/dashboard/campaigns/page.tsx`
  - "Create Campaign" button
  - CampaignTable with data from `/api/v1/campaigns`
  - Filter by status (Active, Paused, Completed)
  - Priority: **HIGH** | Dependency: 5.4.1, 3.1.1

- [ ] **Create campaign detail page** (8 hours)
  - `src/app/(dashboard)/dashboard/campaigns/[id]/page.tsx`
  - Campaign settings form (name, budget, targeting)
  - Performance metrics
  - Associated ads list
  - Save changes to `/api/v1/campaigns/:id`
  - Priority: **MEDIUM** | Dependency: 5.4.2

### 5.5 Payments View
- [ ] **Create PaymentHistoryTable component** (5 hours)
  - `src/components/dashboard/PaymentHistoryTable.tsx`
  - Columns: Date, Amount, Status, Invoice
  - Download invoice button (PDF)
  - Priority: **MEDIUM** | Dependency: 5.2.1

- [ ] **Create payments page** (6 hours)
  - `src/app/(dashboard)/dashboard/payments/page.tsx`
  - Current balance card
  - Next payout date
  - PaymentHistoryTable
  - Fetch from `/api/v1/payments/history`
  - Priority: **MEDIUM** | Dependency: 5.5.1, 3.1.1

- [ ] **Create payment settings page** (4 hours)
  - `src/app/(dashboard)/dashboard/payments/settings/page.tsx`
  - Bank account details form
  - Minimum payout threshold
  - Payout frequency (weekly, monthly)
  - Save to `/api/v1/payments/settings`
  - Priority: **LOW** | Dependency: 3.1.1

### 5.6 Settings View
- [ ] **Create settings page** (8 hours)
  - `src/app/(dashboard)/dashboard/settings/page.tsx`
  - Tabs: Profile, Security, Notifications, API Keys
  - **Profile tab**: firstName, lastName, email, company, phone
  - **Security tab**: Change password, Two-factor authentication
  - **Notifications tab**: Email preferences (checkboxes)
  - **API Keys tab**: Generate/revoke API keys
  - Save to `/api/v1/users/me`
  - Priority: **MEDIUM** | Dependency: 3.1.1

---

## Phase 6: Polish & Optimization (Week 9, 40 hours)

### 6.1 Responsive Design Testing
- [ ] **Test all pages at 320px (mobile)** (4 hours)
  - Ensure no horizontal scrolling
  - Touch targets ≥ 44x44px
  - Readable font sizes (≥ 16px)
  - Priority: **HIGH** | Dependency: All pages

- [ ] **Test all pages at 768px (tablet)** (4 hours)
  - Verify layout transitions
  - Hamburger menu functionality
  - Priority: **HIGH** | Dependency: All pages

- [ ] **Test all pages at 1920px (desktop)** (2 hours)
  - Max content width constraints
  - No overly stretched content
  - Priority: **MEDIUM** | Dependency: All pages

### 6.2 Accessibility Audit
- [ ] **Run Lighthouse accessibility audit** (3 hours)
  - Target score: ≥ 95
  - Fix identified issues (contrast, alt text, ARIA labels)
  - Priority: **CRITICAL** | Dependency: All pages

- [ ] **Test with NVDA screen reader (Windows)** (3 hours)
  - Navigate entire site with keyboard only
  - Verify all content is announced correctly
  - Priority: **HIGH** | Dependency: All pages

- [ ] **Test with VoiceOver (macOS)** (3 hours)
  - Same as NVDA test
  - Priority: **HIGH** | Dependency: All pages

- [ ] **Keyboard navigation testing** (2 hours)
  - Tab through all interactive elements
  - Verify focus indicators visible
  - Test skip navigation link
  - Priority: **HIGH** | Dependency: All pages

- [ ] **Add aria-labels to emoji** (2 hours)
  - Find all emoji usage
  - Add descriptive aria-label attributes
  - Example: `<span role="img" aria-label="Peace sign">✌️</span>`
  - Priority: **HIGH** | Dependency: All pages

### 6.3 Performance Optimization
- [ ] **Optimize images** (4 hours)
  - Convert to WebP format
  - Define explicit width/height
  - Add `priority` prop to hero images
  - Lazy load below-the-fold images
  - Priority: **HIGH** | Dependency: All pages

- [ ] **Implement font preloading** (2 hours)
  - Add `<link rel="preload">` for Sweden Sans fonts
  - Test font loading performance
  - Priority: **HIGH** | Dependency: 1.1.5

- [ ] **Analyze bundle size** (3 hours)
  - Run `npm run build` and review bundle report
  - Use `next/bundle-analyzer`
  - Identify and code-split large dependencies
  - Target: < 200KB initial bundle
  - Priority: **HIGH** | Dependency: All phases

- [ ] **Optimize Core Web Vitals** (4 hours)
  - Run Lighthouse on key pages
  - Fix LCP issues (reduce server response time, eliminate render-blocking resources)
  - Fix CLS issues (reserve space for images, avoid dynamic content shifts)
  - Fix FID issues (minimize JavaScript execution time)
  - Target: LCP < 2.5s, FID < 100ms, CLS < 0.1
  - Priority: **CRITICAL** | Dependency: 6.3.1, 6.3.2, 6.3.3

### 6.4 SEO Optimization
- [ ] **Add metadata to all pages** (4 hours)
  - Title tags (unique per page)
  - Meta descriptions (< 160 characters)
  - Open Graph tags for social sharing
  - Canonical URLs
  - Priority: **HIGH** | Dependency: All pages

- [ ] **Create sitemap.xml** (2 hours)
  - Use `next-sitemap` package
  - Include all public pages
  - Submit to Google Search Console
  - Priority: **MEDIUM** | Dependency: All pages

- [ ] **Create robots.txt** (1 hour)
  - Allow all pages except `/dashboard/*`
  - Point to sitemap
  - Priority: **MEDIUM** | Dependency: 6.4.2

---

## Phase 7: Testing & Quality Assurance (Week 10, 40 hours)

### 7.1 Unit Testing
- [ ] **Write tests for Button component** (2 hours)
  - Test variants, states, click handlers
  - Target: 100% coverage
  - Priority: **HIGH** | Dependency: 1.4.1

- [ ] **Write tests for Link component** (1 hour)
  - Test variants, hover states
  - Priority: **MEDIUM** | Dependency: 1.4.1

- [ ] **Write tests for Accordion component** (2 hours)
  - Test expand/collapse, keyboard navigation
  - Priority: **MEDIUM** | Dependency: 1.4.1

- [ ] **Write tests for forms** (4 hours)
  - NewsletterForm, ContactForm validation
  - Submit behavior, error handling
  - Priority: **HIGH** | Dependency: 1.4.1

- [ ] **Write tests for API client** (3 hours)
  - Mock axios requests
  - Test auth interceptor, token refresh
  - Priority: **HIGH** | Dependency: 1.4.1

- [ ] **Write tests for Zustand stores** (2 hours)
  - Auth store actions
  - Consent store persistence
  - Priority: **MEDIUM** | Dependency: 1.4.1

- [ ] **Achieve 80% overall code coverage** (4 hours)
  - Run `npm run test:coverage`
  - Write additional tests for uncovered code
  - Priority: **HIGH** | Dependency: 7.1.1-7.1.6

### 7.2 Integration Testing
- [ ] **Test newsletter signup flow** (2 hours)
  - Fill form → submit → verify API call → check success message
  - Test validation errors
  - Priority: **HIGH** | Dependency: 3.2.1

- [ ] **Test contact form flow** (2 hours)
  - Same as newsletter test
  - Priority: **MEDIUM** | Dependency: 3.3.1

- [ ] **Test authentication flows** (4 hours)
  - Signup → login → dashboard access
  - Logout → redirected to signin
  - Token refresh on expiry
  - Priority: **CRITICAL** | Dependency: 3.4.1, 3.4.2

### 7.3 End-to-End Testing (Playwright)
- [ ] **Write E2E test: Homepage to signup** (3 hours)
  - Navigate homepage → click "Sign up" → fill form → submit → verify dashboard
  - Priority: **HIGH** | Dependency: 1.4.2

- [ ] **Write E2E test: Signin to analytics** (3 hours)
  - Signin → navigate to analytics → verify charts load
  - Priority: **HIGH** | Dependency: 1.4.2

- [ ] **Write E2E test: Newsletter signup** (2 hours)
  - Fill newsletter form → submit → verify success message
  - Priority: **MEDIUM** | Dependency: 1.4.2

- [ ] **Run E2E tests in CI/CD** (2 hours)
  - Add Playwright to GitHub Actions
  - Run on every PR
  - Priority: **HIGH** | Dependency: 1.2.5, 7.3.1-7.3.3

### 7.4 Cross-Browser Testing
- [ ] **Test in Chrome** (2 hours)
  - Verify all features work
  - Priority: **CRITICAL** | Dependency: All phases

- [ ] **Test in Firefox** (2 hours)
  - Same as Chrome
  - Priority: **HIGH** | Dependency: All phases

- [ ] **Test in Safari** (2 hours)
  - Same as Chrome (special attention to date picker, font rendering)
  - Priority: **HIGH** | Dependency: All phases

- [ ] **Test in Edge** (1 hour)
  - Quick sanity check (Chromium-based, should match Chrome)
  - Priority: **MEDIUM** | Dependency: All phases

### 7.5 Security Testing
- [ ] **Run OWASP ZAP scan** (3 hours)
  - Automated security scan
  - Fix identified vulnerabilities
  - Priority: **HIGH** | Dependency: All phases

- [ ] **Manual security review** (4 hours)
  - Check for XSS vulnerabilities (test input fields)
  - Verify CSRF protection (check API routes)
  - Test authentication bypass attempts
  - Verify rate limiting works
  - Priority: **CRITICAL** | Dependency: All phases

---

## Phase 8: Monitoring & Launch Prep (Week 10, 20 hours)

### 8.1 Error Tracking
- [ ] **Set up Sentry** (3 hours)
  - Create Sentry account/project
  - Install `@sentry/nextjs`
  - Configure `sentry.client.config.ts` and `sentry.server.config.ts`
  - Test error capture
  - Priority: **CRITICAL** | Dependency: 1.2.2

- [ ] **Configure Sentry alerts** (1 hour)
  - Set up PagerDuty integration
  - Alert on high error rate (> 10 errors/min)
  - Priority: **HIGH** | Dependency: 8.1.1

### 8.2 Analytics Setup
- [ ] **Set up Vercel Analytics** (1 hour)
  - Enable in Vercel dashboard
  - Verify data collection
  - Priority: **HIGH** | Dependency: 1.2.3

- [ ] **Set up Google Analytics 4** (2 hours)
  - Create GA4 property
  - Add measurement ID to env vars
  - Implement consent-gated loading
  - Test event tracking (page views, signups, demo requests)
  - Priority: **HIGH** | Dependency: 3.5.3

### 8.3 Uptime Monitoring
- [ ] **Set up Checkly** (3 hours)
  - Create account
  - Add API checks for critical endpoints:
    - Homepage (200 status)
    - Signin page (200 status)
    - Dashboard (requires auth)
  - Add browser check for signup flow
  - Set check frequency: 5 minutes
  - Configure alerts (PagerDuty)
  - Priority: **HIGH** | Dependency: None

### 8.4 Performance Monitoring
- [ ] **Set up Vercel Speed Insights** (1 hour)
  - Enable in Vercel dashboard
  - Monitor Core Web Vitals in production
  - Priority: **MEDIUM** | Dependency: 1.2.3

- [ ] **Create Lighthouse CI workflow** (2 hours)
  - Add to GitHub Actions
  - Run Lighthouse on every PR
  - Fail CI if performance score < 90
  - Priority: **MEDIUM** | Dependency: 1.2.5

### 8.5 Documentation & Handoff
- [ ] **Document environment variables** (1 hour)
  - Update `.env.example` with all required vars
  - Document where to obtain API keys (Mailchimp, Sentry, GA)
  - Priority: **HIGH** | Dependency: All phases

- [ ] **Write deployment runbook** (3 hours)
  - Step-by-step guide for deploying to production
  - Rollback procedure
  - Common issues and solutions
  - Priority: **HIGH** | Dependency: 1.2.3

- [ ] **Create handoff document** (3 hours)
  - Project overview
  - Technology stack
  - File structure
  - How to run locally
  - How to deploy
  - Monitoring links
  - Support contacts
  - Priority: **MEDIUM** | Dependency: All phases

---

## Phase 9: Launch (Week 10, Final Day)

### 9.1 Pre-Launch Checklist
- [ ] **Run full test suite** (1 hour)
  - Unit tests, integration tests, E2E tests
  - All must pass
  - Priority: **CRITICAL** | Dependency: Phase 7

- [ ] **Verify all environment variables in production** (1 hour)
  - Check Vercel dashboard
  - Test API connections
  - Priority: **CRITICAL** | Dependency: 1.2.3

- [ ] **Run final Lighthouse audit** (1 hour)
  - Performance: > 95
  - Accessibility: > 95
  - Best Practices: > 95
  - SEO: > 95
  - Priority: **CRITICAL** | Dependency: 6.3.4

- [ ] **Test DNS resolution** (0.5 hour)
  - Verify `apexmediation.bel-consulting.ee` points to Vercel
  - Test SSL certificate
  - Priority: **CRITICAL** | Dependency: 1.2.4

- [ ] **Perform load test** (2 hours)
  - Simulate 10k concurrent users (use k6 or Artillery)
  - Monitor error rates, response times
  - Verify rate limiting triggers correctly
  - Priority: **HIGH** | Dependency: All phases

### 9.2 Launch
- [ ] **Merge `develop` to `main`** (0.5 hour)
  - Trigger production deployment
  - Monitor Vercel deployment logs
  - Priority: **CRITICAL** | Dependency: 9.1.1-9.1.5

- [ ] **Verify production site is live** (0.5 hour)
  - Visit `apexmediation.bel-consulting.ee`
  - Test key flows (signup, login, dashboard)
  - Priority: **CRITICAL** | Dependency: 9.2.1

- [ ] **Monitor error rates for 1 hour** (1 hour)
  - Watch Sentry dashboard
  - Check Vercel Analytics
  - Verify no critical errors
  - Priority: **CRITICAL** | Dependency: 9.2.2

### 9.3 Post-Launch
- [ ] **Submit sitemap to Google Search Console** (0.5 hour)
  - Verify ownership
  - Submit `sitemap.xml`
  - Priority: **MEDIUM** | Dependency: 6.4.2

- [ ] **Announce launch** (1 hour)
  - Internal team notification
  - Social media posts (if applicable)
  - Update status page
  - Priority: **LOW** | Dependency: 9.2.3

- [ ] **Schedule 24-hour post-launch review** (1 hour meeting)
  - Review error logs
  - Check analytics data
  - Identify any issues
  - Plan hotfixes if needed
  - Priority: **HIGH** | Dependency: 9.2.3

---

## Ongoing Maintenance (Post-Launch)

### Monthly Tasks
- [ ] **Review analytics data** (2 hours/month)
  - Most visited pages
  - Conversion rates (signups, demo requests)
  - Bounce rates
  - Identify optimization opportunities

- [ ] **Update dependencies** (2 hours/month)
  - Run `npm outdated`
  - Update minor/patch versions
  - Test for breaking changes
  - Run full test suite

- [ ] **Review error logs** (1 hour/month)
  - Sentry dashboard
  - Identify recurring issues
  - Create tickets for fixes

- [ ] **Performance audit** (1 hour/month)
  - Run Lighthouse
  - Check Core Web Vitals trends
  - Optimize as needed

### Quarterly Tasks
- [ ] **Accessibility audit** (4 hours/quarter)
  - Run automated tools (Axe, WAVE)
  - Manual screen reader testing
  - Fix identified issues

- [ ] **Security audit** (4 hours/quarter)
  - OWASP ZAP scan
  - Review dependency vulnerabilities (`npm audit`)
  - Update security headers if needed

- [ ] **Content refresh** (8 hours/quarter)
  - Update outdated documentation
  - Publish new blog posts
  - Add new case studies

---

## Appendix: Dependencies Summary

### Production Dependencies
```json
{
  "@headlessui/react": "^1.7.18",
  "axios": "^1.6.7",
  "date-fns": "^3.3.1",
  "framer-motion": "^11.0.5",
  "lucide-react": "^0.330.0",
  "next": "^14.1.0",
  "react": "^18.2.0",
  "react-day-picker": "^8.10.0",
  "react-dom": "^18.2.0",
  "react-hook-form": "^7.50.0",
  "react-syntax-highlighter": "^15.5.0",
  "recharts": "^2.12.0",
  "zod": "^3.22.4",
  "zustand": "^4.5.0"
}
```

### Development Dependencies
```json
{
  "@playwright/test": "^1.41.2",
  "@sentry/nextjs": "^7.100.1",
  "@testing-library/jest-dom": "^6.4.2",
  "@testing-library/react": "^14.2.1",
  "@types/node": "^20.11.16",
  "@types/react": "^18.2.52",
  "@types/react-dom": "^18.2.18",
  "@vitejs/plugin-react": "^4.2.1",
  "autoprefixer": "^10.4.17",
  "eslint": "^8.56.0",
  "eslint-config-next": "^14.1.0",
  "husky": "^9.0.10",
  "postcss": "^8.4.35",
  "prettier": "^3.2.5",
  "tailwindcss": "^3.4.1",
  "typescript": "^5.3.3",
  "vitest": "^1.2.2"
}
```

### Backend Dependencies (Additions)
```json
{
  "@mailchimp/mailchimp_marketing": "^3.0.80"
}
```

---

## Effort Summary by Category

| Category | Hours | Percentage |
|----------|-------|------------|
| **Foundation & Setup** | 80 | 20% |
| **Marketing Pages** | 80 | 20% |
| **Backend Integration** | 40 | 10% |
| **Documentation** | 40 | 10% |
| **Dashboard** | 80 | 20% |
| **Polish & Optimization** | 40 | 10% |
| **Testing & QA** | 40 | 10% |
| **TOTAL** | **400 hours** | **100%** |

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Sweden Sans unavailable** | Medium | Low | Use Inter or Public Sans fallback |
| **Backend API changes** | High | Medium | Version API, maintain backward compatibility |
| **Vercel downtime** | High | Very Low | Have Cloudflare Pages backup plan |
| **Scope creep** | Medium | High | Strict adherence to this document, defer non-critical features |
| **Performance issues** | Medium | Low | Monitor Core Web Vitals, optimize proactively |
| **Accessibility non-compliance** | High | Low | Regular audits, automated testing |

---

## Success Criteria

**Technical:**
- ✅ All 400 tasks completed
- ✅ 80%+ test coverage
- ✅ Lighthouse scores > 95 (all categories)
- ✅ Zero critical accessibility issues
- ✅ Core Web Vitals in green (LCP < 2.5s, FID < 100ms, CLS < 0.1)

**Business:**
- ✅ Site live at `apexmediation.bel-consulting.ee`
- ✅ Newsletter signups functional
- ✅ Dashboard fully integrated with backend
- ✅ Documentation published and searchable
- ✅ Uptime > 99.9% first month

**Design:**
- ✅ Visual parity with Website.docx specifications
- ✅ Color palette exactly matches (hex values)
- ✅ Typography scales correctly across breakpoints
- ✅ Playful yet professional feel achieved

---

**Next Steps:**
1. Review and approve this todo list
2. Assign developer(s) to phases
3. Set up project management tracking (Jira, Linear, GitHub Projects)
4. Begin Phase 1: Foundation & Setup
5. Weekly standup meetings to track progress

---

**Document Maintainer**: Development Team  
**Last Updated**: January 2025  
**Status**: Ready for implementation
