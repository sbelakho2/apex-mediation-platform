# Component-to-Specification Reference Guide

This document provides a complete mapping of every UI component to its implementation source in Design.md and WEBSITE_DESIGN.md.

---

## 📋 Quick Reference Table

| Component | File Path | Design.md § | WEBSITE_DESIGN.md § | Status |
|-----------|-----------|-------------|---------------------|--------|
| NotificationBar | `/src/components/NotificationBar.tsx` | "Top Notification Bar" | "Homepage Components" | ✅ Complete |
| HomeNav | `/src/components/HomeNav.tsx` | "Main Navigation" | "Navigation" | ✅ Complete |
| Hero | `/src/app/page.tsx` (lines 15-40) | "Hero Section" | "Homepage Hero" | ✅ Complete |
| PopularCard | `/src/app/page.tsx` (lines 42-59) | "Popular Right Now" | "Callout Sections" | ✅ Complete |
| FeatureCard | `/src/app/page.tsx` (lines 64-95) | N/A | "Features Grid" | ✅ Complete |
| NewsletterPanel | `/src/components/NewsletterPanel.tsx` | "Newsletter Sign-up Panel" | "Newsletter" | ✅ Complete |
| CTA Section | `/src/app/page.tsx` (lines 100-113) | N/A | "CTA Section" | ✅ Complete |
| Footer | `/src/components/Footer.tsx` | "Footer" | "Footer Components" | ✅ Complete |
| CookieBanner | `/src/components/CookieBanner.tsx` | "Cookie Banner" | "Cookie Consent" | ✅ Complete |
| SignIn | `/src/app/signin/page.tsx` | "Authentication" | "Auth Pages" | ✅ Complete |
| SignUp | `/src/app/signup/page.tsx` | "Authentication" | "Auth Pages" | ✅ Complete |
| Sidebar | `/src/components/dashboard/Sidebar.tsx` | "Dashboard Navigation" | "Dashboard Layout" | ✅ Complete |
| TopBar | `/src/components/dashboard/TopBar.tsx` | N/A | "Dashboard Layout" | ✅ Complete |
| Blog/Quiz | Not yet created | "Blog and Quiz Callout Cards" | "Callout Sections" | ❌ Pending |
| Swedish Way | Not yet created | "The Swedish Way Section" | "Brand Story" | ❌ Pending |
| ScallopedDivider | Not yet created | "Scalloped Edges" | "Decorative Elements" | ❌ Pending |

---

## 🏠 Homepage Components

### NotificationBar
**Location:** `/src/components/NotificationBar.tsx`

**Design.md Reference:**
```
§ "Top Notification Bar with Scalloped Edge"
- Golden yellow background (#FECB00)
- Scalloped bottom edge using SVG path
- Close button on right
- Announcement message with emoji
```

**Implementation:**
```tsx
// Reference: Design.md § "Top Notification Bar"
<div className="bg-sunshine-yellow py-3 px-4 relative">
  <p className="text-center text-primary-blue font-bold">
    🎉 Bring-your-own SDKs now ship 15 built-in adapters across Android, iOS, Unity, CTV, and Web.
  </p>
  <svg className="absolute bottom-0 left-0 w-full" ...>
    {/* Scalloped edge path */}
  </svg>
</div>
```

**Colors Used:**
- Background: `bg-sunshine-yellow` (#FECB00)
- Text: `text-primary-blue` (#005293)

---

### HomeNav
**Location:** `/src/components/HomeNav.tsx`

**Design.md Reference:**
```
§ "Main Navigation"
- Horizontal menu on desktop
- Hamburger menu on mobile (<960px)
- Golden yellow uppercase links
- 2px underline on hover
- Sign In link + Sign Up button
```

**Implementation:**
```tsx
// Reference: Design.md § "Main Navigation"
<nav className="py-4">
  {/* Desktop menu */}
  <div className="hidden md:flex items-center justify-between">
    <div className="flex space-x-8">
      {['Features', 'Pricing', 'Documentation', 'Blog'].map(item => (
        <a className="text-sunshine-yellow uppercase font-bold text-sm
                      hover:underline hover:underline-offset-4
                      hover:decoration-2">
          {item}
        </a>
      ))}
    </div>
  </div>

  {/* Mobile hamburger */}
  <button className="md:hidden" onClick={toggleMenu}>☰</button>
</nav>
```

**Colors Used:**
- Links: `text-sunshine-yellow` (#FECB00)
- Overlay: `bg-primary-blue` (#005293)
- Backdrop: `bg-black/50`

**Responsive:**
- Desktop: Horizontal menu visible
- Mobile (< 768px): Hamburger icon triggers full-screen overlay

---

### Hero Section
**Location:** `/src/app/page.tsx` (lines 15-40)

**Design.md Reference:**
```
§ "Hero Section"
- Deep blue background (#005293)
- Golden yellow headline with emoji
- White subtitle text
- Two CTA buttons (yellow + blue outline)
- "Pause animation" link
```

**Implementation:**
```tsx
// Reference: Design.md § "Hero Section"
<section className="container mx-auto px-4 py-12 md:py-20">
  <h1 className="text-hero-sm md:text-hero-md lg:text-hero
                 font-bold uppercase text-sunshine-yellow
                 tracking-tight">
    📈 Maximize Your Ad Revenue ✌️
  </h1>
  <p className="text-body-large text-white">
    Enterprise-grade ad mediation platform...
  </p>
  <a href="/signup" className="btn-primary-yellow">Get Started Free →</a>
  <a href="/docs" className="btn-secondary-blue">View Documentation</a>
</section>
```

**Typography:**
- Headline: `text-hero` (5rem desktop → 3rem tablet → 2rem mobile)
- Subtitle: `text-body-large` (1.2rem)
- Letter spacing: `-1.5px` on headline

---

### Popular Right Now
**Location:** `/src/app/page.tsx` (lines 42-59)

**Design.md Reference:**
```
§ "Popular Right Now"
- Small golden yellow heading "Popular Right Now"
- 3-column grid of cards
- Blue cards with golden top/bottom borders
- Golden yellow card titles
- White body text
- "Learn more →" link in golden yellow
```

**Implementation:**
```tsx
// Reference: Design.md § "Popular Right Now"
<section className="container mx-auto px-4 py-16">
  <h2 className="text-sunshine-yellow font-bold uppercase text-sm mb-8">
    Popular Right Now
  </h2>
  <div className="grid md:grid-cols-3 gap-8">
    <PopularCard title="Real-Time Bidding" description="..." />
  </div>
</section>

function PopularCard({ title, description }) {
  return (
    <div className="bg-primary-blue border-t-4 border-b-4
                    border-sunshine-yellow p-6">
      <h3 className="text-sunshine-yellow font-bold uppercase">
        {title}
      </h3>
      <p className="text-white">{description}</p>
      <div className="text-sunshine-yellow">Learn more →</div>
    </div>
  );
}
```

**Colors Used:**
- Background: `bg-primary-blue` (#005293)
- Borders: `border-sunshine-yellow` (#FECB00), 4px top and bottom
- Title: `text-sunshine-yellow`
- Body: `text-white`

---

### Features Grid
**Location:** `/src/app/page.tsx` (lines 64-95)

**WEBSITE_DESIGN.md Reference:**
```
§ "Features Grid"
- White background section
- Blue heading with emoji
- 3-column grid of white cards
- Emoji icons (4xl size)
- Blue headings (h3)
- Gray body text
- Hover shadow effect
```

**Implementation:**
```tsx
// Reference: WEBSITE_DESIGN.md § "Features Grid"
<section className="bg-white py-20">
  <h2 className="text-h2 font-bold uppercase text-primary-blue">
    Why Choose ApexMediation? 🚀
  </h2>
  <div className="grid md:grid-cols-3 gap-8">
    <FeatureCard emoji="💰" title="Higher Revenue" description="..." />
  </div>
</section>

function FeatureCard({ emoji, title, description }) {
  return (
    <div className="card p-6 hover:shadow-lg">
      <div className="text-4xl">{emoji}</div>
      <h3 className="text-h3 text-primary-blue">{title}</h3>
      <p className="text-body text-gray-700">{description}</p>
    </div>
  );
}
```

**Colors Used:**
- Section bg: `bg-white`
- Heading: `text-primary-blue` (#005293)
- Card: `.card` class (white with gray border)
- Body: `text-gray-700`

---

### NewsletterPanel
**Location:** `/src/components/NewsletterPanel.tsx`

**Design.md Reference:**
```
§ "Newsletter Sign-up Panel"
- Cream background (#E8E3D1)
- 2-column grid (text left, form right)
- Blue heading with emoji
- Email input with blue border
- Golden yellow submit button
- Disclaimer text
```

**Implementation:**
```tsx
// Reference: Design.md § "Newsletter Sign-up Panel"
<section className="bg-cream py-16">
  <div className="container mx-auto px-4">
    <div className="grid md:grid-cols-2 gap-8 items-center">
      <div>
        <h2 className="text-h2 uppercase font-bold text-primary-blue">
          Stay Updated 📬
        </h2>
        <p className="text-body text-gray-700">
          Get weekly insights...
        </p>
      </div>
      <form>
        <input type="email" className="input w-full" />
        <button className="btn-primary-yellow w-full">Subscribe →</button>
        <p className="text-xs text-gray-600">No spam. Unsubscribe anytime.</p>
      </form>
    </div>
  </div>
</section>
```

**Colors Used:**
- Background: `bg-cream` (#E8E3D1)
- Heading: `text-primary-blue` (#005293)
- Input border: 2px `border-primary-blue`
- Button: `btn-primary-yellow` (#FECB00)

---

### Footer
**Location:** `/src/components/Footer.tsx`

**Design.md Reference:**
```
§ "Footer"
- Deep blue background (#005293)
- 5-column layout (About, Product, Resources, Legal, Follow Us)
- Golden yellow column headings
- 2px golden bottom border on headings
- White link text
- Social media icons (Twitter, GitHub, LinkedIn)
- Copyright line at bottom
```

**Implementation:**
```tsx
// Reference: Design.md § "Footer"
<footer className="bg-primary-blue text-white py-12">
  <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
    {/* Column 1: About */}
    <div>
      <h3 className="text-sunshine-yellow font-bold uppercase mb-4
                     border-b-2 border-sunshine-yellow pb-2">
        About
      </h3>
      <ul className="space-y-2">
        <li><a href="#" className="hover:text-sunshine-yellow">Company</a></li>
      </ul>
    </div>
    {/* Repeat for Product, Resources, Legal, Follow Us */}
  </div>
  <p className="text-center text-sm mt-8">
    © 2025 ApexMediation. All rights reserved.
  </p>
</footer>
```

**Colors Used:**
- Background: `bg-primary-blue` (#005293)
- Headings: `text-sunshine-yellow` (#FECB00)
- Border: `border-sunshine-yellow`, 2px bottom
- Links: `text-white`, hover: `hover:text-sunshine-yellow`

---

### CookieBanner
**Location:** `/src/components/CookieBanner.tsx`

**Design.md Reference:**
```
§ "Cookie Banner"
- Fixed bottom position (z-50)
- Pale yellow background (#F9E7A3)
- 2px top border in blue
- Cookie emoji + text
- "Cookie settings" link
- "Accept all cookies" button in golden yellow
- localStorage persistence
- Slide-up animation on mount
```

**Implementation:**
```tsx
// Reference: Design.md § "Cookie Banner"
<div className={`fixed bottom-0 left-0 right-0 bg-pale-yellow
                 border-t-2 border-primary-blue z-50
                 ${!visible ? 'hidden' : ''}`}>
  <div className="container mx-auto px-4 py-4">
    <p className="text-sm text-gray-800">
      🍪 We use cookies to enhance your experience...
      <a href="#" className="underline ml-2">Cookie settings</a>
    </p>
    <button onClick={handleAccept} className="btn-primary-yellow">
      Accept all cookies 🍪
    </button>
  </div>
</div>
```

**Colors Used:**
- Background: `bg-pale-yellow` (#F9E7A3)
- Border: `border-primary-blue` (#005293), 2px top
- Button: `btn-primary-yellow` (#FECB00)

---

## 🔐 Authentication Pages

### Sign In Page
**Location:** `/src/app/signin/page.tsx`

**Design.md Reference:**
```
§ "Authentication Pages"
- Deep blue background (#005293)
- White card with rounded corners
- Uppercase heading in blue
- Input fields with blue borders
- Golden yellow submit button
- Links in blue with underline
```

**Implementation:**
```tsx
// Reference: Design.md § "Authentication"
<div className="min-h-screen bg-primary-blue flex items-center justify-center">
  <div className="bg-white p-10 rounded-xl shadow-lg">
    <h2 className="text-h2-sm font-bold uppercase text-primary-blue
                   tracking-tight">
      Sign in to your account
    </h2>
    <input type="email" className="input w-full" />
    <button className="btn-primary-yellow w-full">Sign in →</button>
    <a href="/signup" className="text-primary-blue font-bold underline">
      Create a new account
    </a>
  </div>
</div>
```

**Colors Used:**
- Page background: `bg-primary-blue` (#005293)
- Card: `bg-white`
- Heading: `text-primary-blue`
- Button: `btn-primary-yellow` (#FECB00)
- Links: `text-primary-blue underline`

---

### Sign Up Page
**Location:** `/src/app/signup/page.tsx`

Same structure as Sign In, with 5 form fields (name, email, company, password, confirm password).

---

## 📊 Dashboard Components

### Sidebar
**Location:** `/src/components/dashboard/Sidebar.tsx`

**Design.md Reference:**
```
§ "Dashboard Navigation"
- Deep blue background (#005293)
- Golden yellow logo (uppercase)
- White navigation links
- Golden yellow active state (background + blue text)
- Golden yellow hover state
- Navigation items: Dashboard, Revenue, Analytics, Networks,
  A/B Tests, Fraud, Apps, Placements, Settings
```

**Implementation:**
```tsx
// Reference: Design.md § "Dashboard Navigation"
<div className="bg-primary-blue">
  <h1 className="text-sunshine-yellow uppercase font-bold">ApexMediation</h1>
  <nav>
    {navigation.map(item => (
      <Link href={item.href} className={`
        ${isActive
          ? 'bg-sunshine-yellow text-primary-blue font-bold'
          : 'text-white hover:text-sunshine-yellow'}
      `}>
        <item.icon />
        {item.name}
      </Link>
    ))}
  </nav>
</div>
```

**Colors Used:**
- Background: `bg-primary-blue` (#005293)
- Logo: `text-sunshine-yellow` (#FECB00)
- Active state: `bg-sunshine-yellow text-primary-blue`
- Default: `text-white`
- Hover: `hover:text-sunshine-yellow`

---

## 🎨 Global Classes Reference

### Button Classes
```css
/* globals.css */

.btn-primary-yellow {
  background: #FECB00;      /* Sunshine yellow */
  color: #005293;           /* Primary blue text */
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.75rem 2rem;
  border-radius: 0;
  transition: all 0.2s;
}

.btn-secondary-blue {
  background: #005293;      /* Primary blue */
  color: #FECB00;           /* Sunshine yellow text */
  border: 2px solid #FECB00;
  font-weight: 700;
  text-transform: uppercase;
}
```

### Card Classes
```css
.card {
  background: white;
  border: 1px solid #e5e7eb;
  padding: 1.5rem;
  border-radius: 0.5rem;
  transition: box-shadow 0.2s;
}

.card-blue {
  background: #005293;
  color: white;
  border: 2px solid #FECB00;
}
```

### Input Classes
```css
.input {
  border: 2px solid #005293;
  padding: 0.75rem;
  border-radius: 0.25rem;
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input:focus {
  outline: none;
  border-color: #FECB00;
  box-shadow: 0 0 0 3px rgba(254, 203, 0, 0.1);
}
```

---

## 📝 Design Token Reference

### Colors
```typescript
// tailwind.config.ts
colors: {
  'primary-blue': '#005293',      // Deep blue (Study in Sweden)
  'sunshine-yellow': '#FECB00',   // Golden yellow (Swedish flag)
  'cream': '#E8E3D1',             // Pale beige
  'accent-red': '#C04437',        // Red accent
  'pale-yellow': '#F9E7A3',       // Cookie banner yellow
}
```

### Typography
```typescript
// tailwind.config.ts
fontFamily: {
  sans: ['var(--font-sweden-sans)', 'system-ui', 'sans-serif'],
}

fontSize: {
  'hero': ['5rem', { lineHeight: '1.1', letterSpacing: '-1.5px' }],
  'hero-md': ['3rem', { lineHeight: '1.2', letterSpacing: '-1.2px' }],
  'hero-sm': ['2rem', { lineHeight: '1.2', letterSpacing: '-1px' }],
  'h2': ['2.8rem', { lineHeight: '1.2', letterSpacing: '-1px' }],
  'h2-md': ['2rem', { lineHeight: '1.3', letterSpacing: '-0.8px' }],
  'h2-sm': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.6px' }],
  'h3': ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.3px' }],
  'body': ['1rem', { lineHeight: '1.6', letterSpacing: '-0.4px' }],
  'body-large': ['1.2rem', { lineHeight: '1.6', letterSpacing: '-0.4px' }],
}
```

### Spacing
```typescript
// Design.md spacing guidelines
Sections: py-16 (4rem) to py-20 (5rem)
Cards: p-6 (1.5rem) to p-8 (2rem)
Gaps: gap-6 (1.5rem) to gap-8 (2rem)
Container: max-w-7xl mx-auto px-4
```

---

## 🔍 Finding Component Specs

### To find a component's design specification:

1. **Open the component file** (e.g., `/src/components/NotificationBar.tsx`)

2. **Look for the reference comment at the top:**
   ```tsx
   // Reference: Design.md § "Top Notification Bar"
   ```

3. **Open Design.md and search for that section:**
   - Search for "Top Notification Bar"
   - Read the full specification
   - Check color codes, spacing, responsive behavior

4. **Check WEBSITE_DESIGN.md for technical details:**
   - Component structure
   - State management
   - API integrations
   - Data flow

### Example Workflow:

**Question:** "What should the Newsletter panel look like?"

**Answer:**
1. Open `/src/components/NewsletterPanel.tsx`
2. See comment: `// Reference: Design.md § "Newsletter Sign-up Panel"`
3. Open Design.md, search "Newsletter Sign-up Panel"
4. Find specification:
   - Cream background (#E8E3D1)
   - 2-column grid
   - Email form with golden button
   - Disclaimer text

---

## 📚 Documentation Files

### Primary Sources
1. **Design.md** - Visual design specification (208 lines)
   - Color palette
   - Typography scale
   - Component recipes
   - Layout guidelines

2. **WEBSITE_DESIGN.md** - Technical implementation guide
   - Component architecture
   - State management
   - API integrations
   - Responsive breakpoints

3. **UI_IMPLEMENTATION_AUDIT.md** - Compliance audit (8,500 words)
   - Page-by-page analysis
   - Component reference map
   - Missing components list
   - Priority checklist

4. **DESIGN_SYSTEM_IMPLEMENTATION_STATUS.md** - Progress tracking
   - Completion percentages
   - Before/after comparisons
   - Next steps roadmap

5. **PHASE_1_SUMMARY.md** - Phase 1 achievements
   - Visual summaries
   - Metrics dashboard
   - Key achievements list

---

**Last Updated:** January 2025
**Maintained By:** Platform Engineering
**Status:** Phase 1 Complete (65% overall compliance)
