ApexMediation Console — Full Visual & UX Spec (BYO v1.0)
0) Design Foundations (tokens you can drop into Tailwind/CSS variables)
Color system (WCAG AA on light & dark)

Brand

--brand-50: #e8f0ff

--brand-100: #d2e0ff

--brand-200: #a8c2ff

--brand-300: #7ea4ff

--brand-400: #598bff

--brand-500: #356eff ← Primary

--brand-600: #1f55e6

--brand-700: #1742b4

--brand-800: #12358d

--brand-900: #0c235d

Neutrals

--gray-50: #f8fafc (surfaces)

--gray-100: #f1f5f9

--gray-200: #e2e8f0

--gray-300: #cbd5e1

--gray-400: #94a3b8

--gray-500: #64748b

--gray-600: #475569

--gray-700: #334155

--gray-800: #1f2937

--gray-900: #0f172a (titles on light)

Semantic

Success: #16a34a, hover #15803d, bg #ecfdf5

Warning: #d97706, hover #b45309, bg #fffbeb

Danger: #dc2626, hover #b91c1c, bg #fef2f2

Info: #0891b2, hover #0e7490, bg #ecfeff

Text

Primary text: --text-strong: #0f172a (light), #f8fafc (dark)

Secondary text: --text-muted: #475569 (light), #94a3b8 (dark)

Link default: --brand-600, hover --brand-700, visited --brand-800

Focus Ring

--focus: #356eff (2px outline + 2px offset)

Dark mode overrides

Background: #0b1220

Surface: #0f172a/#111827

Text strong: #e5e7eb

Cards: #121a2a

Dividers: #1f2937

Typography

Primary font: Inter (system fallback: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial)

Monospace (code): JetBrains Mono

Scale (desktop rem / px, line-height):

Display: 2.25rem / 36px, lh 1.15 (H1)

Title: 1.5rem / 24px, lh 1.25 (H2)

Section: 1.25rem / 20px, lh 1.35 (H3)

Body L: 1rem / 16px, lh 1.6

Body S: 0.875rem / 14px, lh 1.6

Caption: 0.75rem / 12px, lh 1.45

Spacing, radii, elevation

Grid base: 8px

Spacing tokens: 4, 8, 12, 16, 20, 24, 32, 40, 48

Card radius: 12px (2xl)

Button radius: 10px (xl)

Input radius: 10px

Shadows: sm 0 1px 2px rgba(15,23,42,.06), md 0 4px 16px rgba(15,23,42,.08), lg 0 10px 30px rgba(15,23,42,.12)

Breakpoints & containers

sm: ≥640px (container 600px)

md: ≥768px (container 720px)

lg: ≥1024px (container 960px)

xl: ≥1280px (container 1200px)

2xl: ≥1536px (container 1360px, max 1440)

Navbar rail: 280px fixed on lg+, collapsible on md, bottom-tab on sm

1) Global Layout
App shell

Header (64px): left logo (32px), org/project switcher, search (command-K), right cluster (help, notifications, user avatar).

Left rail (lg+): 280px fixed, hover highlights --brand-50 bg, active pill with --brand-500 text/border.

Content: center container per breakpoint, top/bottom padding 24px, section gaps 24px.

Page structure

Page header: H1 + actions (primary button on the right). Breadcrumbs (Body S) above H1 if needed.

Section cards: title (H3), description (Body S), content grid. Cards have 16px inner padding on sm, 24px md+, 32px xl+.

Responsiveness patterns

Two-column split (70/30) collapses to single column below 1024px.

Data tables hide least important columns on md and show via “Columns” menu.

Inline filters collapse into “Filters” drawer on small screens.

2) Component Specifications
Buttons

Primary: bg --brand-500, hover --brand-600, active --brand-700, text white; disabled 50% opacity; focus ring.

Secondary: bg --gray-100, hover --gray-200; text --gray-800.

Tertiary (ghost): transparent, text --brand-600, hover bg --brand-50.

Danger: bg danger, hover darker.

Sizes: L (44px, 16px text, 20px horizontal padding), M (40px, 14px), S (32px, 12px).

Icon buttons: 40px square tap target; tooltip on hover/focus.

Inputs (text/select/checkbox)

Height 40px (S 36px), 12px radius, 1px border --gray-300, focus ring --focus.

Error state: border danger + helper text in Caption danger.

Disabled: 60% opacity; retain contrast for label.

Selects & Combobox

Menu max height 320px, item height 40px, selected bg --brand-50, check icon right-aligned.

Type-ahead search inside combobox.

Tabs

Underline active style: 2px --brand-500; hover underline --brand-200.

Cards

Elevation md, 12px radius, header 56px area (title left, actions right), content padded.

Toasts

Bottom-right stack, 6s auto-dismiss, success (green bg), error (red bg), info (brand-50).

Tooltips

8px radius, shadow sm, delay 150ms, arrow 8px.

Modals & Drawers

Modal width 640px md+, full width sm, close on ESC, focus trap.

Drawer right 480px.

Data table

Row height 56px (dense 48px), zebra off, hover --gray-50.

Header: sticky, 48px height, sort icons.

Bulk actions bar appears on selection.

Empty state: icon, title, 2 lines description, primary CTA.

Skeleton rows: 5 placeholders on initial load.

Charts (Recharts)

Line/Area colors from brand scale; grid subtle --gray-200; axis labels Body S; legend below chart; tooltip with 8px radius card.

3) Page Layouts (key screens with exact geometry)
A. Overview /dashboard

Header: H1 “Overview”, Actions: “Create placement”.

KPI row (4 cards): width: 25% each (lg+), 50% (md), 100% (sm); height 120px; metrics: Revenue, eCPM, Fill, Win-rate.

Trends grid (2x): Left “Revenue & eCPM (7d)”, Right “Fill & Win-rate (7d)”; charts 320–400px height.

Alerts card: list of SLO breaches; each row 48px with severity icon.

B. Placements /dashboard/placements

Header: H1 + “New placement”.

Filters: left (format, status), right (search); 16px gaps.

Table: columns [Name|Format|Floor|Networks|Status|Updated|Actions].

Row Actions: View, Edit, Duplicate, Archive (kebab menu).

Empty state: “Create your first placement”.

Detail /dashboard/placements/[id]

Tabs: Overview | Optimization | Test Ads | Activity

Overview: left 70%:

KPIs (Requests/Fill/eCPM), chart (latency p95, timeouts)

Right 30%: “Placement health” (status badges), “Recent changes”.

Optimization tab

Left card: Floors (global + per geo/device) table; inline edit popover.

Right card: Pacing & Capping controls.

Bottom card: A/B/n bandits (arms, allocations, expected lift).

Test Ads tab

Device allowlist (chips + add form), “Request test ad” button; show Receipt link on success.

C. Networks (BYO) /dashboard/networks

Grid of network tiles (logo 32px, name, status pill).

Click → detail page:

Credentials card: masked inputs, “Reveal” with confirm, “Test connection” button.

Permissions card: checkmarks for scopes (reporting.read, bidding.write).

Environment: Sandbox/Production switch (with explainer).

D. Transparency /dashboard/transparency/receipts

Filters: date/time range, placement, adapter, status.

Table: [ReqID|Placement|Winner|eCPM|Timeouts|Created|Actions]

Detail: bid waterfall with bars: each adapter row shows bid or status (no_fill/timeout), latency; winner flagged; floor line; signature panel (hash + “Copy”); Share link (expiring).

E. Config Rollouts /dashboard/transparency/config-rollouts

Current rollout card: version, % rollout, time remaining; SLO widgets (crash-free, ANR, timeouts).

Controls: Advance, Pause, Rollback (danger confirm).

History: past 10 versions with outcome (✅/⛔).

F. Observability

Overview: Top adapters by latency/error; SLO badges; “View runbook” links.

Metrics: Line charts per adapter, percentile select (p50/p95/p99), CSV export.

Debugger: timeline list (most recent 100), expands to sanitized JSON; link to receipt (if present); PII toggle default ON.

G. Reconciliation

Importer wizard: Upload CSV → Map columns → Validate preview → Commit.

Discrepancies table: [Date|Placement|Network|Reported|Observed|Δ|Status|Actions]; resolve flow with comment.

H. Settings

API Keys: table (name, scopes, last used), “New key” modal (scopes checklist), “Copy” masked, rotate/revoke with audit.

Webhooks: list, HMAC secret, test delivery (logs viewer).

Roles: invite by email, role picker; SSO group mappings.

Audit Log: filter by actor/date/event; CSV export.

4) Interaction & Motion

Transitions: 120–180ms ease-in-out for hover/active; dialogs 180ms scale+fade; skeleton shimmer 1.2s.

No layout shift (CLS): reserve heights for charts, tables, images (via CSS aspect-ratio & min-heights).

Loading: use skeletons for tables/cards; spinners only inline.

5) Accessibility (exact checks)

Focus order strictly follows DOM; Skip to content link appears on tab.

Focus ring on all interactive items (2px --focus + 2px offset).

Color contrast: text ≥ 4.5:1 (body) and ≥ 3:1 (large); links underlined on hover and when contrast borderline.

Keyboard: Tabs switch with arrow keys; modals trap focus; ESC closes; menus close on blur/ESC.

ARIA: role=table/row/columnheader; buttons have aria-label when icon-only; toasts use aria-live="polite".

6) Responsive Rules (per breakpoint)

sm (<768px)

Single column; rail becomes bottom tab bar (5–7 items max; rest under “More” sheet).

Charts min-height 260px.

Tables switch to card list (key fields); “View details” opens drawer.

md (≥768px)

Two columns where possible (66/33).

Data tables show 1–2 extra columns; filters appear in a left sheet.

lg (≥1024px)

Classic app: rail visible, 70/30 two-column, full table columns, sticky side panels.

xl+

Increase card padding to 32px; charts height 360–420px.

7) QA & “Works-Out-Of-The-Box” Checklists
Visual & layout

 Lighthouse scores: Perf ≥90, A11y ≥95, Best-Practices ≥95, SEO ≥90 on Overview, Placements, Transparency pages.

 CLS < 0.1: no shifting when data loads (verify with performance panel).

 Breakpoints: sm/md/lg/xl renders with correct column show/hide; no overflow/scrollbar flicker.

 Grid alignment: 8px rhythm—inspect paddings/margins in DevTools on 3 random cards/pages.

Interactions

 All buttons have hover, active, disabled; tooltips appear on icon buttons.

 Modals trap focus; ESC closes; confirm dialogs require explicit consent on destructive actions.

 Command-K palette opens; can navigate to placements and receipts via keyboard.

Data & states

 Empty states visible for new orgs (Overview, Placements, Transparency).

 Loading: skeletons render for tables and charts; spinners limited to inline controls.

 Error banners use consistent pattern (icon + message + retry).

A11y

 Run axe-core: 0 critical/serious issues.

 Manual keyboard flow for: onboarding, placement create, network creds save, rollout pause/advance/rollback.

Security

 Security headers present (CSP, HSTS, XFO, XCTO, Referrer-Policy).

 Mutations require CSRF token; blocked if missing.

 API keys masked; “Copy” works; rotation revokes old key and logs audit.

Performance

 TTI < 3s on mid-tier laptop + 4G (throttled).

 Route bundle sizes under threshold (warn >300KB); charts & debugger code-split.

Observability

 Client RUM sends page_view and form_submit (sampled).

 Server metrics show p95 for /v1/metrics, /v1/transparency endpoints.

8) Sample Tokens & Tailwind Mapping (drop-in)
:root {
  --brand-500:#356eff; --brand-600:#1f55e6; --brand-700:#1742b4;
  --gray-50:#f8fafc; --gray-100:#f1f5f9; --gray-200:#e2e8f0; --gray-900:#0f172a;
  --text-strong:#0f172a; --text-muted:#475569; --focus:#356eff;
  --success:#16a34a; --warning:#d97706; --danger:#dc2626; --info:#0891b2;
}
/* Focus utility */
:focus-visible { outline:2px solid var(--focus); outline-offset:2px; }

// tailwind.config.js (snippet)
theme: {
  extend: {
    colors: {
      brand: { 500: 'var(--brand-500)', 600: 'var(--brand-600)', 700:'var(--brand-700)' },
      gray:  { 50:'var(--gray-50)',100:'var(--gray-100)',200:'var(--gray-200)',900:'var(--gray-900)' },
      success:'#16a34a', warning:'#d97706', danger:'#dc2626', info:'#0891b2'
    },
    borderRadius: { DEFAULT: '10px', xl: '12px', '2xl': '16px' },
    boxShadow: {
      sm:'0 1px 2px rgba(15,23,42,.06)',
      md:'0 4px 16px rgba(15,23,42,.08)',
      lg:'0 10px 30px rgba(15,23,42,.12)',
    }
  }
}

9) “No-Glitch” Engineering Rules

Pre-declare min-heights for all charts/cards to prevent CLS.

Load heavy components (charts/debugger) with dynamic import + skeleton.

Debounce window resize to 120ms for responsive recalcs.

Avoid position: sticky jitter by reserving header height and disabling transforms on ancestors.

10) Out-of-box E2E (Playwright) Scenarios

First-run: login → onboarding (create app/placement) → see Overview KPIs with demo data → pass axe + Lighthouse.

Placements CRUD: create/edit/floor change → optimization save → test ad → receipt opens & shares link.

Networks BYO: save masked creds → health check ok → status pill turns green → audit log entry created.

Transparency: filter by placement → open receipt → copy signature → share link opens read-only view.

Config rollout: schedule → advance to 5% → simulate SLO breach → auto-rollback visible in history.

Settings: create API key (scopes) → copy → rotate → revoke; create webhook → test delivery.

A11y keyboard: navigate to debugger → expand event → open receipt → back to list (no mouse).

11) Visual Regression & Theming

Lock baseline screenshots (light & dark) for: Overview, Placements list/detail, Networks list/detail, Transparency list/detail, Rollouts, Debugger, Settings (Keys/Webhooks).

Theming switch toggles CSS variables only (no layout change); verify all text maintains AA contrast in dark.

12) Acceptance Criteria (ship gate)

 All pages meet Lighthouse & axe-core thresholds.

 CLS < 0.1 across dashboard flows.

 Keyboard accessibility verified for top 7 flows.

 Security headers present & correct; CSRF enforced.

 BYO creds masked at rest; audit for write/read.

 Transparency receipts retrievable, signed, shareable.

 OTA rollout operations succeed; auto-rollback demonstrated in staging.

 Design tokens used consistently (no hard-coded hex outside tokens).

 Route bundle sizes under budgets; lazy-load heavy components.

 Visual regression tests stable (≤2% diff allowed for charts).