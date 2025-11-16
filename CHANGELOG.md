Changelog — FIX-03 Console Productization & Data Integrity (2025-11-16)

Summary
- Documents the latest FIX-03 milestones focused on billing reliability, build hygiene, and session security across the console. The changes harden invoice delivery, keep `.next` artifacts out of builds, enforce App Router bundle budgets, finish the admin billing operations UI, and expand auth/session regression coverage.

What changed (highlights)
- Core console hardening (FIX-03-37 → FIX-03-67)
  - FIX-03-37 — `console/src/app/admin/health/page.tsx` now uses TanStack Query with abortable fetches, server-provided RED thresholds, and an admin-only gate to avoid unbounded client polling.
  - FIX-03-38 — `console/src/app/billing/layout.tsx` enforces billing-specific RBAC/feature checks before rendering nested tabs and auto-builds navigation labels from the routing config.
  - FIX-03-39 — `console/src/app/fraud/page.tsx` scopes API calls to the active session, adds paginated/sortable alert tables, and centralizes severity colors in the Tailwind theme.
  - FIX-03-40 — `console/src/app/login/page.tsx` removed credential logging, added password-manager-friendly inputs, wired CSRF protection, and exposes optional CAPTCHA/rate-limit hints without showing demo creds in production.
  - FIX-03-41 — `console/src/components/dashboard/FraudWidget.tsx` reads fraud thresholds from backend configuration, guards against missing stats, and hides CTAs when the feature flag is disabled.
  - FIX-03-42 — `console/src/components/ui/CopyButton.tsx` gracefully downgrades when Clipboard API is unavailable, reinstates tooltips, cleans up timers, and surfaces toasts for both success and fallback flows.
  - FIX-03-43 — `console/src/lib/useFeatures.ts` respects `NEXT_PUBLIC_API_URL`, supports abort/cancellation, and exposes typed errors so callers can react (e.g., hide nav entries offline).
  - FIX-03-44 — `console/src/llm/providers.ts` shed mock providers in favor of a lazy provider registry with concurrency/rate-limit tracking, keeping dead code out of the bundle.
  - FIX-03-45 — `console/src/app/billing/invoices/[id]/page.tsx` now validates access, uses object-URL fallbacks with cleanup, and surfaces toast errors instead of blocking alerts.
  - FIX-03-46 — `console/src/app/payouts/page.tsx` moved to React Query with cursor pagination, localized CSV exports, and authenticated scoping.
  - FIX-03-47 — `console/src/app/settings/compliance/page.tsx` stores blocked regions/categories as structured arrays, encrypts locally cached consent strings, and debounces mutations.
  - FIX-03-48 — `console/src/components/dashboard/DashboardCharts.tsx` memoizes query keys, standardizes timezone conversions, and adds explicit loading/error states.
  - FIX-03-49 — `console/src/components/migration-studio/ImportWizard.test.tsx` now covers API connector modes, error states, keyboard dismissal, and mutation retries with fake timers reset per test.
  - FIX-03-50 — `console/src/components/migration-studio/ImportWizard.tsx` was split into store + presentation layers, batches assignment persistence, adds clipboard fallbacks, and improves accessibility for focus traps.
  - FIX-03-51 — `console/src/lib/api-client.ts` caches CSRF tokens, avoids `window.location` mutations during SSR, and emits structured unauthorized events instead of redirecting blindly.
  - FIX-03-52 — `console/src/lib/csrf.ts` detects the correct base URL, raises typed `CsrfFetchError`s on failure, and works server-side without silently returning null.
  - FIX-03-53 — `console/src/lib/rbac.ts` defaults to deny, includes HTTP metadata on thrown errors, and narrows role typing for improved safety.
  - FIX-03-54 — `console/src/lib/useSession.ts` namespaces React Query keys per tenant/session, redirects gracefully on errors, and auto-invalidates on logout.
  - FIX-03-55 — `console/src/llm/budget.ts` persists budgets per user in storage, enforces locking to prevent concurrent edits, and keeps currency math configurable.
  - FIX-03-56 — `console/src/app/admin/sales-automation/page.tsx` now reads live automation metrics, paginates tables, and removes demo placeholders.
  - FIX-03-57 — `console/src/app/api/auth/[...nextauth]/route.ts` supports GitHub OAuth (when env vars present), gates demo auth outside dev, and normalizes errors for the login UI.
  - FIX-03-58 — `console/src/app/billing/invoices/page.tsx` relies on TanStack Query with AbortControllers, typed filter props, and localized currency/date formatting.
  - FIX-03-59 — `console/src/app/dashboard/page.tsx` pulls real KPI/fraud/payout data with proper loading/error placeholders and normalized CSV export helpers.
  - FIX-03-60 — `console/src/app/page.tsx` performs a server-side session check to redirect authenticated users straight to `/dashboard`.
  - FIX-03-61 — `console/src/app/placements/new/page.tsx` consolidates format metadata, validates duplicates, previews slugs, and clarifies validation hints.
  - FIX-03-62 — `console/src/app/settings/team/page.tsx` adds outside-click/escape handlers, confirmation dialogs for destructive actions, and dynamic role labels.
  - FIX-03-63 — `console/src/app/transparency/auctions/page.test.tsx` now uses resilient selectors, verifies URL sync + Verify badge flows, and isolates clipboard mocks per test.
  - FIX-03-64 — `console/src/components/Navigation.a11y.test.tsx` exercises keyboard focus order, reduced-motion settings, and aria-label coverage across feature-flag permutations.
  - FIX-03-65 — `console/src/components/charts/RevenueCharts.tsx` localizes axes/values, handles percent vs decimal inputs, and exposes SSR-safe fallbacks.
  - FIX-03-66 — `console/src/components/ui/Filters.tsx` sources status options from config, localizes labels, and enforces typed filter values.
  - FIX-03-67 — `console/src/components/ui/StatusBadge.tsx` expands status support, aligns colors with Tailwind tokens, and exports a shared capitalization helper.
- Billing downloads & cache safety (FIX-03-68)
  - `console/src/lib/billing.ts`: Replaced the unbounded invoice PDF cache with a TTL-bound map (10-minute TTL, max 25 entries), revokes blob URLs, and falls back to data URLs when `URL.createObjectURL` is unavailable (SSR/tests). Cache now invalidates on logout or any 401 via `AUTH_UNAUTHORIZED_EVENT`.
  - `console/src/lib/useSession.ts`: Logout clears the invoice cache so leaked blobs cannot persist across accounts.
  - Tests (`console/src/lib/__tests__/billing.test.ts`, `billing.pdf.msw.test.ts`) cover TTL expiry, unauthorized purges, SSR fallbacks, and resend helper wiring.
- Build hygiene & bundle budget enforcement (FIX-03-69 & FIX-03-70)
  - Added `console/scripts/clean-next-cache.js` and wired `npm run clean` / `prebuild` so `.next/` artifacts are purged before fresh builds.
  - New `scripts/check-prerender-leaks.js` runs post-build to scan prerender manifests for secrets.
  - `console/scripts/check-bundle-size.js`: Refactored to understand App Router chunk naming, auto-runs `npm run build` when `.next` output is missing, and enforces budgets for both shared chunks and route segments. `npm run bundle-size` now produces actionable JSON reports.
  - `console/package.json`: Added `clean`, `prebuild`, `postbuild`, and updated `bundle-size` script to invoke the new guard.
- Admin billing operations UI (FIX-03-71)
  - `console/src/app/admin/billing/page.tsx`: Page now requires an explicit reconciliation risk acknowledgement, reuses idempotency keys across double-clicks, exposes a working resend-invoice form with validation, and surfaces success/error states for both flows.
  - Added Jest coverage at `console/src/app/admin/billing/__tests__/page.test.tsx` to verify acknowledgement gating and resend trimming/validation.
- Session security regression coverage (FIX-03-72)
  - `console/src/app/api/auth/__tests__/session.security.test.ts`: Exercises credentials authorize path (mock vs backend), ensures API failures log and return null, verifies CSRF header attachment/reuse for mutating API calls, and asserts that 401 responses emit the shared `apex:auth:unauthorized` event payload.
- Layout shell guard for unauth routes (FIX-03-73)
  - Introduced `console/src/app/AppShell.tsx`, a lightweight client wrapper that detects public routes (`/`, `/login`, `/auth/*`, `/public/*`) and skips mounting the expensive navigation tree when sessions aren’t required.
  - `console/src/app/layout.tsx` now composes `AppShell` inside `Providers`, preventing session/feature queries from firing on the login page and other unauthenticated surfaces.
  - Added coverage via `console/src/app/__tests__/AppShell.test.tsx` to ensure public routes bypass navigation while authenticated routes keep the shell.
- Console navigation, breadcrumbs, and transparency polish (FIX-03-74 → FIX-03-78)
  - FIX-03-74 — `console/src/app/providers.tsx` now hydrates TanStack Query caches with `HydrationBoundary`, bootstraps CSRF tokens once per session, and reuses a memoized QueryClient to prevent duplicate prefetches during fast refresh.
  - FIX-03-75 — `console/src/app/settings/page.tsx` performs a server-side session + feature check and redirects unauthorized tenants away from settings, eliminating client-only guards that previously flashed unauthorized UI.
  - FIX-03-76 — `console/src/app/transparency/auctions/page.a11y.test.tsx` re-enables all axe rules, seeds 25 unique auctions to keep pagination active, and adds keyboard-traversal coverage that tabs through filters → row actions → pagination without getting trapped inside the table.
  - FIX-03-77 — `console/src/components/Breadcrumbs.tsx` localizes common segments, masks identifiers with context-aware labels, exports `buildBreadcrumbsFromPath` for reuse, and ships Jest coverage at `console/src/components/__tests__/Breadcrumbs.test.tsx`; translations live in `console/src/i18n/messages/en.json`.
  - FIX-03-78 — `console/src/components/Navigation.tsx` consumes a declarative blueprint, refreshes feature flags on focus/interval, renders skeleton placeholders while data loads, and is exercised by both `Navigation.a11y.test.tsx` and the new `Navigation.feature.test.tsx` to prove flag-driven rendering and reduced-motion focus treatment.
- Dashboard metrics, clipboard, i18n, billing cache & query hook polish (FIX-03-79 → FIX-03-83)
  - FIX-03-79 — `console/src/components/dashboard/MetricCard.tsx` now normalizes icon sizing/aria labels, supports custom change-formatters, and shares the skeleton via `MetricCardSkeleton`; covered by `console/src/components/dashboard/__tests__/MetricCard.test.tsx`.
  - FIX-03-80 — `console/src/components/ui/CopyButton.tsx` prioritizes the injectable clipboard helper, honors explicit secure-context overrides even in tests, and clarifies tooltip/error states; `console/src/components/ui/__tests__/CopyButton.test.tsx` isolates insecure-context fallbacks, error tooltips, and timer cleanup via fake timers.
  - FIX-03-81 — `console/src/i18n/index.ts` exposes locale registration + warnings for missing translations, configurable currency formatters, and deterministic locale lookups; regression coverage lives in `console/src/i18n/index.test.ts`.
  - FIX-03-82 — `console/src/lib/__tests__/billing.test.ts` introduces a typed `buildAxiosResponse` helper, exercises cache eviction/revalidation/concurrency paths, and ensures mocked object URLs are always restored between tests.
  - FIX-03-83 — `console/src/lib/hooks/useQueryState.ts` guards DOM access (no SSR crashes), renames the multi-param hook to `useQueryParamsState` to avoid name collisions, memoizes returned objects by the serialized query string, and documents/validates behavior in `console/src/lib/__tests__/hooks.test.ts`.
- Notification delivery, navigation gating, pagination & guardrail polish (FIX-03-89 → FIX-03-94)
  - FIX-03-89 — `console/src/app/settings/notifications/page.tsx` now uses React Hook Form field arrays for arbitrary webhook endpoints, validates URLs inline, persists changes immediately through `settingsApi`, and keeps helper copy localized so teams can mirror Slack/email delivery without leaving the page.
  - FIX-03-90 — `console/src/components/Navigation.feature.test.tsx` was rewritten around a single helper that feeds feature flags + roles, then asserts that transparency, migration studio, billing, and admin-only links appear/disappear as expected (including reduced-motion focus states).
  - FIX-03-91 — `console/src/components/ui/Pagination.tsx` adds first/last controls, a direct page input with clamped state, and better aria announcements; `console/src/components/ui/__tests__/Pagination.test.tsx` now covers keyboard entry, button disabling, and callback sequencing for both bounded and overflow values.
  - FIX-03-92 — `console/src/lib/__tests__/hooks.test.ts` exercises the `useUrlQueryParams` helper end-to-end (serialization, defaulting, effect cleanup) so search/filter surfaces that depend on query strings stay covered.
  - FIX-03-93 — `console/src/lib/api.ts` centralizes pagination defaults, unwraps `migrationApi` responses into typed payloads, and guards CSV downloads with size/content-type validation; the `console/src/app/migration-studio/[experimentId]/page.tsx` cards now run currency_cents values through the `fromMinorUnits` formatter so `$1,250.00`-style totals render correctly and the same logic powers chart axis ticks.
  - FIX-03-94 — `console/src/app/403/page.tsx` ships a branded forbidden experience with countdown-based redirect, support CTAs, and focusable actions so RBAC denials aren’t dead ends.
  - Supporting polish — `console/src/i18n/messages/en.json` picked up the shared `billing.filters.*` and `billing.status.*` strings so new dropdowns & badges stay localized without console warnings.
- Adapters, billing, guardrails & placements workflow polish (FIX-03-95 → FIX-03-100)
  - FIX-03-95 — `console/src/app/adapters/page.tsx` now renders inline placement lookup errors with actionable recovery copy, swaps blank rows for descriptive placeholders, and prefetches adapter routes when hovering the table so navigation feels instant even on cold caches.
  - FIX-03-96 — `console/src/app/billing/settings/page.tsx` validates the billing email inline, persists toast messages through reloads, batches preference toggles, and hides the form entirely behind a session/feature guard so finance-only surfaces never flash unauthenticated UI.
  - FIX-03-97 — `console/src/app/error.tsx` captures client errors, posts them to `/api/logs/client-error`, and upgrades the full-page error treatment with branded copy/actions so telemetry stays complete when React surfaces fatal boundaries.
  - FIX-03-98 — `console/src/app/migration-studio/[experimentId]/page.tsx` keeps guardrail inputs in `{input, value}` pairs for precision, debounces copy/share interactions through a resilient clipboard fallback, adds aria-live feedback for download/share flows, and ensures guardrail mutations invalidate experiment caches consistently.
  - FIX-03-99 — `console/src/app/migration-studio/page.tsx` debounces guardrail evaluations per experiment with a timed cooldown, surfaces stacked status banners, extracts a reusable `ExperimentCard`, and wires pause/activate mutations with optimistic refetches; `console/src/i18n/messages/en.json` now includes the guardrail cooldown message so the new hint stays localized.
  - FIX-03-100 — `console/src/app/placements/page.tsx` now aggregates paginated responses with `useInfiniteQuery`, fixes `getNextPageParam`, auto-fetches the next page via an intersection observer, builds status filter options from live placement data, and keeps search/filtering client-side with resilient skeleton + empty states.
  - Supporting hygiene — `console/src/app/transparency/auctions/page.tsx` and its test suite dropped legacy `act()` wrappers by leaning on React Query patterns, eliminating the console spam that previously obscured real warnings.

- Transparency verification UX & sampling polish (FIX-03-101 → FIX-03-105)
  - FIX-03-101 — `console/src/app/transparency/auctions/[auction_id]/page.tsx` now guards fetches with AbortController, only requests verification when an integrity signature exists, surfaces a retry CTA, truncates oversized canonical payload previews (with copy/download helpers), and handles verification failures without blocking the page.
  - FIX-03-102 — `console/src/app/transparency/auctions/page.tsx` prefetches sanitized filters server-side and hands off to a new `AuctionsClient` + `filterUtils` pair that debounces/validates inputs, syncs query params, keeps TanStack Query caches alive via `keepPreviousData`, improves pagination/empty states, and exercises the flow in `page.test.tsx`.
  - FIX-03-103 — `console/src/app/transparency/summary/page.tsx` now uses React Query with abortable requests, exposes refresh/retry controls, adds skeleton + error placeholders, and shows a localized "last updated" timestamp sourced from `dataUpdatedAt`.
  - FIX-03-104 — `console/src/components/ui/Tooltip.tsx` was rebuilt on Floating UI with portals, autoUpdate positioning, arrow alignment, timer cleanup, and SSR guards; `console/package.json` now declares `@floating-ui/react-dom` to support the component.
  - FIX-03-105 — `console/src/components/ui/VerifyBadge.tsx` resets state when auction IDs change, prevents duplicate requests, adds retryable error badges + richer tooltips, and expands coverage in `console/src/components/ui/__tests__/VerifyBadge.test.tsx` for tooltip content, manual retries, compact mode, and spinner states.
  - FIX-03-106 — `console/src/lib/hooks.ts` renames the lightweight query helper to `useUrlQueryParams`, de-dupes router pushes, exposes `history`/`scroll` controls, and ensures `useLoadingState` timers are cleared on unmount; `console/src/lib/__tests__/hooks.test.ts` now covers the new behavior.
  - FIX-03-107 — `console/src/lib/transparency.ts` introduces `TransparencyApiError`, centralized logging, normalized Axios errors, and a `createCancellableRequest` helper so auctions/verification flows can stream or abort large payloads safely.
  - FIX-03-108 — `console/src/lib/useAdminGate.ts` adds SSR guards, deduplicated redirects, opt-out handling, and targeted coverage in `console/src/lib/__tests__/useAdminGate.test.tsx` to prove unauthenticated + non-admin flows only redirect once.
  - FIX-03-109 — `console/.env.local.example` now lists the mock API toggle, consent defaults, transparency refresh/migration flags, and the admin-guard switch so local devs don’t have to cross-reference other docs.
  - FIX-03-110 — `console/src/lib/featureFlags.ts(+tests)` centralizes env-driven booleans so `useAdminGate`, Transparency Auctions/Summary, and the new Billing Migration Assistant UI can actually honor `NEXT_PUBLIC_ENABLE_TRANSPARENCY_REFRESH`, `NEXT_PUBLIC_ENABLE_BILLING_MIGRATION`, and `NEXT_PUBLIC_REQUIRE_ADMIN_GUARD`. `console/README.md` now documents those behaviors (plus Fly.io deployment guidance) to keep docs aligned with shipped surfaces.
- Payout security, logging discipline, cache hygiene, and backend integration accuracy (FIX-03-111 → FIX-03-115)
  - FIX-03-111 — Removed the unused `/api/test` route to keep the App Router surface limited to production APIs.
  - FIX-03-112 — `console/src/app/settings/payout/page.tsx` now fully implements payout reference masking, duplicate-provider warnings, and a confirmation modal with a typed keyword; `/settings/payouts` re-exports the same page to prevent divergence.
  - FIX-03-113 — `.eslintrc.json` disallows `console.log/info` in favor of warn/error and the README documents the client-side observability policy so lint errors come with guidance.
  - FIX-03-114 — `scripts/clean-next-cache.js` wipes both `.next/` and `.swc/` caches, logging each cleanup so developers can diagnose stale-transpile issues quickly.
  - FIX-03-115 — `console/BACKEND_INTEGRATION.md` now calls out that analytics, fraud, and core APIs may live on different hosts/ports and updates the sample `.env.local` to match, preventing local dev from assuming a single proxy.
- Billing truth-in-docs, Storybook + design governance, Dockerfile reproducibility (FIX-03-116 → FIX-03-118)
  - FIX-03-116 — `console/BILLING_README.md` introduces a feature parity snapshot table, splits “shipped” vs “behind-a-flag” capabilities, and documents the upcoming payment method + dunning work so customer-facing copy stays accurate.
  - FIX-03-117 — Added `.storybook/` with Next-aware config, CopyButton & StatusBadge stories, and a Storybook wrapper decorator; `DESIGN_STANDARDS.md` now includes an explicit Tailwind hash and Storybook workflow, `scripts/verify-design-standards-sync.js` enforces hash updates via `npm run design:verify`, and `package.json` exposes `storybook`/`storybook:build` scripts.
  - FIX-03-118 — `console/Dockerfile` now performs a single `npm ci` against the workspace lockfile, builds the standalone Next output, copies only `.next/standalone`, `.next/static`, and `public` into a non-root runtime image, and skips redundant prod installs entirely.
- Runtime env + test guardrails (FIX-03-119 → FIX-03-125)
  - FIX-03-119 — `console/jest.config.js` explicitly disables `passWithNoTests`, preventing CI from silently “passing” when suites are misconfigured.
  - FIX-03-120 — `console/jest.setup.ts` replaces the bespoke Axios adapter with the maintained `axios/lib/adapters/fetch` implementation so MSW intercepts requests without needing to mirror browser semantics by hand.
  - FIX-03-121 — `console/lighthouse.config.cjs` now exercises dashboard, fraud, placements, transparency summary, and billing flows in one run with consistent desktop throttling so perf regressions surface outside billing-only paths.
  - FIX-03-122 — `console/next.config.js` drops the build-time `env` block and enables `output: 'standalone'`, letting Docker/runtime environments supply API URLs at deploy time while keeping the server bundle minimal for the new image flow.
  - FIX-03-123 — `console/scripts/install-playwright-browsers.js` runs during `npm install` (and skips automatically on CI/opt-out) to ensure Playwright browser binaries stay in sync with the lockfile instead of being checked in under `node_modules/`.
  - FIX-03-124 — `console/package-lock.json` was regenerated under npm 9 so workspace scripts/postinstall metadata matches the new lifecycle hooks and keeps deterministic installs for Docker & CI.
  - FIX-03-125 — `console/package.json` now wires `npm test` → lint + coverage (`test:unit`), removes the `--passWithNoTests` escape hatch from every Jest script, and adds `test:watch` so local devs don’t need to reconfigure commands when running targeted suites.

How to verify (local)
```bash
# VerifyBadge badge UX, URL hooks, and admin guard redirects
npm run test --workspace console -- --runTestsByPath \
  src/components/ui/__tests__/VerifyBadge.test.tsx \
  src/lib/__tests__/hooks.test.ts \
  src/lib/__tests__/useAdminGate.test.tsx

# Feature flag wiring for transparency refresh + billing migration assistant
npm run test --workspace console -- --runTestsByPath \
  src/lib/__tests__/featureFlags.test.ts \
  src/app/transparency/auctions/page.test.tsx \
  src/app/billing/settings/page.a11y.test.tsx

# Dashboard metrics, clipboard, i18n, billing cache, and query hooks
npm run test --workspace console -- --runTestsByPath \
  src/components/dashboard/__tests__/MetricCard.test.tsx \
  src/components/ui/__tests__/CopyButton.test.tsx \
  src/i18n/index.test.ts \
  src/lib/__tests__/billing.test.ts \
  src/lib/__tests__/hooks.test.ts

# Billing utilities and admin billing UI
npm run test --workspace console -- --runTestsByPath \
  src/lib/__tests__/billing.test.ts \
  src/lib/__tests__/billing.pdf.msw.test.ts \
  src/app/admin/billing/__tests__/page.test.tsx

# Session security and auth regressions
npm run test --workspace console -- --runTestsByPath \
  src/app/api/auth/__tests__/session.security.test.ts

# Layout shell behavior
npm run test --workspace console -- --runTestsByPath \
  src/app/__tests__/AppShell.test.tsx

# Navigation, breadcrumbs, and transparency accessibility
npm run test --workspace console -- --runTestsByPath \
  src/components/__tests__/Breadcrumbs.test.tsx \
  src/components/Navigation.a11y.test.tsx \
  src/components/Navigation.feature.test.tsx \
  src/app/transparency/auctions/page.a11y.test.tsx

# Notifications, navigation, pagination, migration studio & 403 UX
npm run test --workspace console -- --runTestsByPath \
  src/components/Navigation.feature.test.tsx \
  src/components/ui/__tests__/Pagination.test.tsx \
  src/lib/__tests__/hooks.test.ts \
  src/app/migration-studio/[experimentId]/page.test.tsx

# Transparency auctions + VerifyBadge suites
npm run test --workspace console -- --runTestsByPath \
  src/app/transparency/auctions/page.test.tsx \
  src/components/ui/__tests__/VerifyBadge.test.tsx

# Bundle budget guard (auto-builds if needed)
npm run bundle-size --workspace console
```

Operational notes
- Always run `npm run clean --workspace console` (or rely on the `prebuild` hook) before comparing bundle stats to avoid stale `.next` output.
- The invoice PDF cache now reacts to logout and global unauthorized events; ensure any future auth flows continue dispatching `apex:auth:unauthorized` on 401s so caches stay consistent.

---

Addendum — FIX-03 Console Productization & Data Integrity, items 126–147 (2025-11-16 23:16)

Summary
- Completes FIX‑03 backlog items 126–147 with targeted UX hardening for Adapters/Placements, billing usage performance and localization, payout UX accuracy, an admin audit CSV export, and build hygiene updates (Tailwind globs, TS config, and UI barrel behavior).

What changed (highlights)
- FIX‑03‑126 & 127 — Playwright and PostCSS
  - Verified Playwright runs across Chromium/Firefox/WebKit and PostCSS uses cssnano in production; no code changes required.
- FIX‑03‑128 — Adapters detail page
  - `console/src/app/adapters/[id]/page.tsx`: Added a keyword confirmation modal before deletion (type DELETE), gated the dependent placement query until the adapter is loaded, and normalized fill‑rate editing by converting percent↔decimal consistently.
- FIX‑03‑129 — Admin Audit CSV
  - `console/src/app/admin/audit/page.tsx`: Added a CSV export with proper CSV quoting and safe metadata stringification to avoid HTML injection; added accessible loading/disabled states.
- FIX‑03‑132 — Billing root redirect
  - `console/src/app/billing/page.tsx`: Switched to a server‑side `redirect('/billing/usage')` to eliminate client‑side flash.
- FIX‑03‑133 — Billing Usage data fetching + localization
  - `console/src/app/billing/usage/page.tsx`: Migrated to TanStack Query with abortable fetches and explicit loading/error states; formatting switched to locale‑aware helpers from `@/lib/utils` for numbers, currency, and dates.
  - `console/src/lib/billing.ts`: `getCurrentUsage` now accepts an optional `AbortSignal`.
- FIX‑03‑135 — Placements detail polish
  - `console/src/app/placements/[id]/page.tsx`: Added a confirmation modal with DELETE keyword for destructive deletion; explicit adapters list loading/error states; masked publisher ID in metadata.
- FIX‑03‑137 — PayoutWidget correctness & links
  - `console/src/components/dashboard/PayoutWidget.tsx`: Timezone‑safe days‑until calculation with clamp to zero; localized date label via `formatDate`; settings link unified to `/settings/payout`.
- FIX‑03‑141 — UI barrel server‑safety
  - `console/src/components/ui/index.ts`: Removed top‑level `'use client'` so server components can import non‑interactive exports without forcing client bundles.
- FIX‑03‑144 — Admin lib typing & cancellable requests
  - `console/src/lib/admin.ts`: `metadata` typed as `unknown` and `listBillingAudit` accepts an optional `AbortSignal`.
- FIX‑03‑146 — Tailwind content globs
  - `console/tailwind.config.ts`: Dropped `src/pages` from content globs (App Router only). Updated `console/DESIGN_STANDARDS.md` Tailwind sync marker to satisfy `npm run design:verify`.
- FIX‑03‑147 — TS hygiene
  - `console/tsconfig.json`: Set `allowJs: false` to prevent stray JS files from slipping into the TypeScript codebase.

Notes on adjacent items
- FIX‑03‑139 — `VerifyBadge` already cancels in‑flight requests, resets on ID changes, and supports manual refresh; no change required.
- FIX‑03‑142 — i18n messages are already namespaced (e.g., `billing.*`) in `console/src/i18n/messages/en.json`.
- FIX‑03‑143 — MSW infrastructure is wired in `console/jest.setup.ts` and used by suites that need it; no change required for PDF cache tests that mock Axios directly.

Validation
- Lint: `npm run -w console lint` passes (a11y adjustments included); design standards hash updated and verified.
- Tests: `npm run -w console test` executed; suites pass under the MSW/xhr adapter test environment.

Files affected
- `console/src/app/adapters/[id]/page.tsx`
- `console/src/app/admin/audit/page.tsx`
- `console/src/app/billing/page.tsx`
- `console/src/app/billing/usage/page.tsx`
- `console/src/components/dashboard/PayoutWidget.tsx`
- `console/src/components/ui/index.ts`
- `console/src/lib/billing.ts`
- `console/src/lib/admin.ts`
- `console/tailwind.config.ts`
- `console/DESIGN_STANDARDS.md`
- `console/tsconfig.json`

Anything to watch for
- If any consumers relied on importing the UI barrel to force client behavior, those components should explicitly add `'use client'` at the file top (the barrel no longer does this globally).
- Backend support for optional `AbortSignal` parameters should be confirmed in local/testing environments; the change is backward‑compatible.
- Delete modals use a keyword confirmation (`DELETE`) to prevent accidental removal; confirm this UX meets team expectations.

---

Changelog — FIX-06 Data & ML Pipeline Hardening (2025-11-16)

Summary
- Completes FIX‑06 by hardening the Data & ML toolchain: CI lanes for PRs and nightly runs, manifest single‑source‑of‑truth (SoT) enforcement, dependency parity via constraints across Dockerfiles and CI, and a developer quick‑start for ML workflows.

What changed (highlights)
- CI lanes
  - Added/verified PR fast lane and Nightly ML pipelines.
  - Both lanes now install with `ML/constraints.txt` to ensure deterministic dependency resolution.
  - PR lane runs unit tests, the Manifest SoT guard, and a schema‑validation smoke; Nightly validates manifests, runs streaming feature engineering and a row‑limited training step, and uploads artifacts.
- Manifest integrity / SoT
  - `ML/scripts/check_manifests.py` wired into PR CI to prevent stray or duplicated manifests outside approved roots.
  - `ML/scripts/manifest_tools.py` provides `scan`, `validate`, `refresh`, `compute-checksum` CLIs; tests cover corrupt/missing/strict modes.
- Dependency matrices & environment parity
  - Introduced constraints consumption across Dockerfiles and updated CI to use the same constraints:
    - `Dockerfile.ml` and `Dockerfile.ml-gpu` now install with `-c ML/constraints.txt`.
    - `.github/workflows/ml-pr.yml` and `ml-nightly.yml` install with constraints.
  - Aligned `ML/constraints.txt` pins with `requirements*.txt`.
- Documentation
  - New `ML/README.md` quick‑start explains local install, tests, manifest validation, streaming FE, and tiny training runs.
  - Sign‑off checklist added at `docs/Internal/Development/FIX-06_SIGNOFF.md`.

Affected files
- .github/workflows/ml-pr.yml (install with constraints)
- .github/workflows/ml-nightly.yml (install with constraints)
- Dockerfile.ml (constraints enabled)
- Dockerfile.ml-gpu (constraints enabled)
- ML/constraints.txt (aligned pins)
- ML/README.md (new)
- docs/Internal/Development/FIX-06_SIGNOFF.md (new)

How to verify (local)
```bash
# CPU lane
python -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
pip install -c ML/constraints.txt -r ML/requirements.txt
pytest ML/scripts/tests -q

# Streaming FE + tiny training
python ML/scripts/feature_engineering.py --input <parquet|dir> --out-dir /tmp/fe \
  --stream --input-format parquet --validate-in --validate-out --validate-limit 500
python ML/scripts/train_supervised_logreg.py --features /tmp/fe/features.parquet \
  --row-limit 500 --input-format parquet --out-dir /tmp/model --validate-features --validate-limit 500
```

Operational notes
- Make the “ML PR Fast Lane” workflow a required check in repository Branch protection settings for the default branch.
- Establish a weekly review of “ML Nightly Pipeline” artifacts (see the sign‑off doc) and file issues for any regressions.

---

Changelog — FIX-01 Backend & Core Platform Hardening (2025-11-15)

Summary
- This changelog documents all material changes completed under FIX-01 to get the system ready for sandboxing. It includes operational notes and how to run DB‑backed tests locally.

Key changes
- Backend container healthcheck restored and verified
  - backend/Dockerfile: Alpine image now installs curl and uses a HEALTHCHECK against http://localhost:8080/health. Ports aligned to 8080.

- docker‑compose hygiene and local parity improvements
  - docker-compose.yml: Parameterized environment via ${VAR:-default}, added persistent volume for ClickHouse, and ensured backend/console/website share a network. Added service profiles (dev, full).

- Backend env template cleanup and alignment
  - backend/.env.example: PORT=8080; transparency defaults safe for local; cookie/cors examples; feature flags documented and defaulted off for local.

- Safer Prometheus metrics throughout hot paths
  - New helper: backend/src/utils/metrics.ts provides safeInc/safeObserve to prevent metrics errors from causing 500s.
  - Adopted in critical locations: auth.controller (login flow), twofa.controller, trackingRateLimiter middleware, RTB orchestrator and mock adapters (AdMob, AppLovin, Unity), analytics ingest queue processor.

- CSRF, feature flags, and kill switch robustness
  - CSRF middleware uses typed cookie options and exempts POST /api/v1/auth/(login|register|refresh) and POST /api/v1/flags* so ops can toggle flags without CSRF issues.
  - Kill switch guard matches req.originalUrl and allowlists /health, /metrics, /api/v1/flags, /openapi.json, and /docs to permit recovery and docs.

- Auth and request context safety
  - Auth middleware reads JWT from Authorization or secure cookie via typed access; authorize uses typed role with sensible default.
  - Request context middleware avoids any, propagates requestId/user/tenant safely for correlation logging.

- Test harness stability and modes (lightweight vs DB‑backed)
  - Jest Postgres mock now exports initializeDatabase; Jest config ignores dist/ to avoid duplicate manual mocks.
  - Default tests run in lightweight mode (no DB) for CI speed.
  - DB‑backed tests are opt‑in via environment flags.

- Log files for fixes: error.log, combined.log


- Scripts for clear test lanes
  - backend/package.json:
    - test:fast → jest (no DB)
    - test:db → FORCE_DB_SETUP=true RUN_MIGRATIONS_IN_TEST=true jest --runInBand
    - test:db:docker → Starts Postgres via docker compose and then runs test:db
    - test:db:down → Tears down compose services

- Queue naming guidance
  - backend/BACKGROUND_JOBS.md: Added a section recommending against colon (:) in BullMQ queue names; provided migration notes.

- Deploy script safety
  - backend/deploy-backend.sh: Avoids mutating fly.toml unless ALLOW_TOML_MUTATION=true; prints clear guidance and checks for Fly CLI auth.

How to run DB‑backed tests locally
1) Ensure Docker is running.
2) From the backend workspace directory:
   - npm run test:db:docker
     - This will:
       - Bring up Postgres from the repo’s docker-compose.yml
       - Run Jest with FORCE_DB_SETUP=true and RUN_MIGRATIONS_IN_TEST=true to initialize the DB and execute migrations
  3) After the run, to clean up containers:
     - npm run test:db:down

Environment variables used by the test harness
- FORCE_DB_SETUP=true → Enables real Postgres pool initialization for tests.
- RUN_MIGRATIONS_IN_TEST=true → Runs migrations before tests (requires local Postgres).

Operational notes for sandbox readiness
- Runtime PORT is 8080 across compose and Dockerfile; ensure fly.toml and any load balancers expect port 8080 for the container.
- Feature flags (kill switches, enforcement) are documented in readiness docs and default to safe values locally. Toggle per environment as required.


Additional updates — 2025-11-15 11:10
- Eliminated metrics-induced 500s across auth/2FA/RTB/tracking paths using safeInc/safeObserve and localized try/catch guards.
- Hardened CSRF and feature-flag flows: POST /api/v1/flags is CSRF‑exempt to allow ops toggles during incidents.
- Kill switch allowlist expanded (/health, /metrics, /api/v1/flags, /openapi.json, /docs) and guard now uses req.originalUrl for accuracy.
- Auth and context safety improved: cookie‑based token extraction typed; role defaulting in authorize; requestId/user/tenant propagated via AsyncLocalStorage.
- Jest stability: manual postgres mock exports initializeDatabase; dist/ excluded to avoid duplicate __mocks__.
- OpenAPI helper types tightened to Record<string, unknown> and Swagger UI mounted at /docs with /openapi.json served.
Lint/test status at submission time
- Backend builds successfully.
- Lint: 0 ESLint errors in backend source (tests are relaxed by overrides; warnings permitted).
- Tests: Fast lane fully green — 37/37 suites, 319 tests. DB‑backed tests are documented (require local Postgres); scripts provided above.

---

Changelog — FIX-05 SDK & Client Reliability (2025-11-15)

Summary
- This entry completes FIX‑05 by hardening SDK reliability across the stack with a focus on the Web SDK transport layer, confirming mobile/CTV persistence and config caching, and documenting release and validation steps. It introduces configurable retry/backoff and timeout overrides in the Web SDK, ensures MSW‑backed tests cover retry semantics, and ties the work back to existing Android/iOS config/consent persistence.

What changed (highlights)
- Web SDK (packages/web-sdk)
  - Reliability options added to `init(options)`:
    - `timeoutMs` (existing), `maxRetries` (default 2), `retryBackoffBaseMs` (default 100ms), `retryJitterMs` (default ±50ms).
  - `auctionClient` now implements exponential backoff with jitter and clear retry classification:
    - Retries: network errors and HTTP 5xx; No‑retry: 4xx and validation errors.
    - Respects external `AbortSignal`; any timeout or abort maps to `Errors.timeout()` with the configured `timeoutMs`.
  - MSW/Jest wiring fixed and expanded tests added:
    - Success path, timeout override, retry on 5xx → success, no‑retry on 4xx, retry on network error → success.
  - Files touched: `packages/web-sdk/src/types.ts`, `src/index.ts`, `src/auctionClient.ts`, `setupTests.ts`, `tests/**`, `jest.config.cjs`.

- Android SDK (sdk/core/android)
  - Remote config caching and failure‑tolerant behavior confirmed via `config/ConfigManager.kt` (TTL, cache fallback) and unit tests.
  - Consent handling confirmed with IAB storage reader in `consent/ConsentManager.kt` (TCF, US Privacy). Host apps remain SoT, with optional helper to read SharedPreferences and normalize values.
  - No placeholder adapters ship as production; reflection registry and diagnostics remain intact.

- iOS/tvOS SDK
  - Persistence and registry parity validated (UserDefaults‑based consent/config per earlier implementation notes and CI matrix). No code changes required in this pass; CI remains the gate.

- CTV Android & Unity
  - CTV Android builds with config/consent semantics aligned to mobile; Unity package CI remains green with WebGL headless build smoke; samples validated in CI matrix. No code changes required in this pass.

Release, validation, and artifacts
- Web SDK (run locally):
  - `cd packages/web-sdk`
  - `npm ci && npm run lint && npm run build && npm run test -- --coverage && npm run docs`
  - Artifacts: `dist/` bundles (ESM/UMD), `coverage/`, `typedoc/` (if enabled in CI).
- Android:
  - `./gradlew :sdk:core:android:clean :sdk:core:android:assembleRelease :sdk:core:android:testDebugUnitTest :sdk:core:android:apiCheck :sdk:core:android:checkSdkSize`
  - Artifacts: release AAR, size report, API dump; Dokka HTML via `:dokkaHtml`.
- iOS/tvOS:
  - `xcodebuild -scheme CoreSDK -destination 'platform=iOS Simulator,name=iPhone 15' clean test`
  - `xcodebuild -scheme CoreSDK-tvOS -destination 'platform=tvOS Simulator,name=Apple TV' clean test`
  - Docs via `scripts/ios-docs.sh` (DocC/Jazzy) uploaded by CI.
- Unity:
  - CI `game-ci` test runner executes EditMode/PlayMode; WebGL headless build smoke validates output files.
- CTV Android:
  - `./gradlew :sdk:ctv:android-tv:assembleRelease :sdk:ctv:android-tv:testDebugUnitTest`

Notes and mitigations
- Retry loops are bounded (`maxRetries`) and jittered to avoid thundering herds.
- Web SDK aborts/timeouts are consistently surfaced as `TIMEOUT` with the configured timeout window.
- Mobile persistence and remote‑config caching are already in place; they continue to guard against transient network failures and keep apps operable offline.

Next steps (operational)
- Ensure CI required checks include the web‑sdk workflow (lint/build/test/coverage/docs) alongside existing Android/iOS/Unity/CTV jobs.
- Optionally add an adapter‑parity script that cross‑checks the 15 supported network identifiers across platforms; publish the report as a non‑blocking CI artifact.

Changelog — FIX-02 Fraud & Inference Services Production Readiness (2025-11-15)

Summary
- Captures all work completed to productionize the fraud & ML inference services plus the transparency writer so model loads, auth, and sampling telemetry meet FIX-02 goals.

Key changes
- Enforced auth + tenant scoping for scoring endpoints
  - `services/fraud-inference/main.py` & `services/inference-ml/main.py`: Require backend-issued JWTs on `/v1/score` and `/predict/*`, verify tenant claims, and surface 401/403 responses without leaking payloads.
  - Shared middleware covers trace/log enrichment and ensures anonymous probes never hit model execution.

- Readiness/liveness parity for inference pods
  - Added `/health/live` and `/health/ready` handlers plus ONNX load checks so Fly/Kubernetes only route traffic after models finish initializing.
  - Dockerfiles install missing healthcheck dependencies (e.g., `requests`) and run as non-root where possible; Helm charts wire readiness probes to `/health/ready` with configurable thresholds.

- Helm + artifact parameterization
  - `services/fraud-inference/helm` and `services/inference-ml/helm`: Image tags no longer default to `latest`, PVC names and model subdirectories are configurable, JWT secrets are injected via env/secret refs, and optional extra env/volume mounts allow staged rollouts.
  - Documented model rotation workflow referencing `models/fraud/latest` and the PVC expectations for each chart.

- Transparency writer breaker + alerting upgrades
  - `backend/src/services/transparencyWriter.ts`: Emits gauges for last success/failure, breaker cooldown remaining, and failure streak; ClickHouse errors are sanitized before logging.
  - `backend/src/utils/opsAlert.ts`: Central helper used to emit `transparency_clickhouse_failure`, `transparency_breaker_open`, and `transparency_breaker_closed` events with severity routing.
  - Tests updated (`backend/src/services/__tests__/transparencyWriter.test.ts`) to assert alert emission and new metrics; scripts `npm run transparency:metrics-check` and `npm run transparency:smoke` document the canary drill.

- Documentation + runbooks
  - `docs/Internal/Development/FIXES.md`: Appended FIX-02 completion log with validation steps and breaker canary checklist.
  - CHANGELOG updated (this entry) so downstream consumers know when inference auth + telemetry hardened.

How to verify
```bash
# Backend transparency writer suite
cd backend
npm run test -- transparencyWriter

# Inference service tests (run individually)
cd services/fraud-inference && pip install -r requirements.txt && pytest
cd ../inference-ml && pip install -r requirements.txt && pytest

# Container smoke tests
docker build services/fraud-inference -t fraud-inference:test && docker run --rm -p 8080:8080 fraud-inference:test curl -f http://localhost:8080/health/ready
```

Operational notes
- Helm values now require explicit image versions; update CI/CD pipelines to set the tag via chart values instead of editing manifests.
- Breaker alerts feed standard log pipelines; wire `alert_event` field filters into PagerDuty/Slack to notify SREs about ClickHouse failures before transparency data gaps appear.
- When rotating models, update the PVC content first, then bump the Helm `requiredModels` list to force readiness checks before traffic resumes.

Lint/test status at submission time
- Backend: `npm run test -- transparencyWriter` ✅, `npm run lint` passes with pre-existing `no-explicit-any` warnings (unchanged count).
- Inference services: Pytest suites green locally; container healthchecks verified via `docker build` + `curl /health/ready` as noted above.
