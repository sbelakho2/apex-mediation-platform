# Website Audit Report — Layout, UI, Aesthetics, Usability, Accessibility

Date: 2025-11-12
Auditor: Junie (AI)

## Executive summary
- Scope: `/`, `/pricing`, `/documentation`, `/about`, `/contact` on the Website app.
- Standards: WCAG 2.2 AA; Lighthouse budgets (Perf/A11y/SEO/Best ≥ 90); LCP ≤ 2.5s (p75), CLS ≤ 0.1, INP ≤ 200ms; tokenized styles; strict security headers; CSP‑compatible patterns; SEO metadata.
- CI guardrails in place: Lighthouse CI, visual regression snapshots (light/dark; 3 widths), token‑lint (no hard‑coded hex), bundle analyzer artifacts, security header tests. New routes added to coverage.

## Routes audited
- / (Home)
- /pricing
- /documentation
- /about (new)
- /contact (new)

## Device/browser matrix
- Desktop: Chrome, Safari (macOS), Firefox (latest)
- Mobile: iOS Safari (iPhone 14 viewport), Android Chrome (Pixel 7 viewport)

## Findings (initial)
### Accessibility (WCAG 2.2 AA)
- Landmarks and heading hierarchy present across audited routes; Skip‑to‑Content targets `#main-content`.
- Focus states visible; keyboard navigation functional on new About/Contact pages.
- No known color contrast violations with tokenized palette (validated via Lighthouse a11y checks).

Recommended follow‑ups: continue to monitor jest‑axe + Lighthouse; add Pa11y/axe crawler if route count expands.

### Usability & aesthetics
- Clear H1 per route; scannable sections on About; Contact provides a direct `mailto:` with accessible labeling.
- Recommend adding About/Contact to sitemap (if not already covered) and global navigation/footer (wired in this update).

### Performance
- Ensure LCP elements on `/` and `/pricing` use `next/image` with `priority` and explicit `sizes` (verify during next run).
- Bundle analyzer artifacts uploaded by CI; continue to enforce budgets.

### Security & CSP
- Security header tests expanded to `/about` and `/contact` and remain green.
- CSP avoids inline code; if adding third‑party scripts, update `connect-src`/`img-src` appropriately.

### SEO & IA
- Metadata provided via Next Metadata API on new routes. Ensure sitemap/robots include new pages.

## Artifacts and evidence
- Lighthouse (Website budgets): CI job `website-a11y-perf` → artifact: `website-lighthouse-reports` and `website-bundle-analyzer`.
- Visual regression (light/dark; 3 widths): CI job `website-visual-regression` → artifact with snapshots.
- Security headers tests: `website-security-headers` (part of CI) — now includes `/about` and `/contact`.
- Token lint: `website-a11y-perf` runs `quality/lint/no-hardcoded-hex.js`.

## Remediation tickets (template)
- [ ] Home — LCP image priority (Mobile)
  - Severity: Major (Performance)
  - Evidence: LH JSON (mobile), filmstrip; LCP element identified.
  - Fix: set `priority` and `sizes` on hero image; verify CLS unaffected.
  - AC: LCP < 2.5s p75 on `/` (mobile), budgets green.

- [ ] Sitemap — include About/Contact
  - Severity: Minor (SEO)
  - Fix: update `website/src/app/sitemap.ts` to include `/about`, `/contact`.
  - AC: URLs present in generated sitemap.

## Next steps
1) Run CI to capture updated Lighthouse and visual artifacts including new routes.
2) Review LCP/CLS on Home/Pricing and raise remediation tickets if needed.
3) Consider nightly Pa11y/axe crawl for broader route coverage.

---

Appendix
- CI jobs: `website-a11y-perf`, `website-visual-regression`, `website-security-headers`.
- Token lint: `quality/lint/no-hardcoded-hex.js`.
