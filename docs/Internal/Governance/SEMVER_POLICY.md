# Semantic Versioning Policy — ApexMediation Surfaces

> **VERIFY-FIRST:** Apply this policy before tagging or documenting releases. Each surface must prove compatibility and attach evidence listed below.

## 1. SDKs (Android, iOS, Unity, Web/CTV)
- **Version Format:** `MAJOR.MINOR.PATCH` tags (e.g., `android-sdk@1.3.2`).
- **When to bump:**
  - MAJOR — Breaking API change (public method removal, behavior changes, new minimum OS).
  - MINOR — Backward-compatible feature additions or dependency updates exposed to integrators.
  - PATCH — Bug fixes, security updates, internal perf changes.
- **Prerequisites:**
  - Green `sdk-release.yml`, `android-sdk.yml`, `ios-sdk.yml`, `unity-sdk.yml`, `web-sdk.yml` workflows.
  - Updated changelog entry and docs (see `docs/Internal/Development/SDK_IMPROVEMENTS_COMPLETE.md`).
  - Release artifacts uploaded (APK/AAR, XCFramework, UPM tarball, npm package) with hashes.
- **Command Reference:** `npm run version --workspace sdk/core/android -- --release-as minor` (analogous for other workspaces).

## 2. Backend APIs (Auction, Transparency, Billing)
- **Version Format:** Docker image tag + Git tag `backend@MAJOR.MINOR.PATCH`.
- **Rules:**
  - Breaking schema/contract → MAJOR.
  - New endpoints/fields (backward compatible) → MINOR.
  - Internal fixes/perf/no external impact → PATCH.
- **Gates:**
  - `ci-all.yml` and `deploy-staging.yml` success.
  - OpenAPI schemas updated + contract tests in `backend/tests/`.
  - Feature flags documented in `docs/Internal/Deployment/PROJECT_STATUS.md`.

## 3. Console / Dashboard
- **Version Format:** `console@MAJOR.MINOR.PATCH` recorded in `console/package.json` and release tags.
- **Promotion Triggers:** Any user-visible component change, API dependency shift, or analytics integration updates the MINOR version; bugfix-only releases patch.
- **Checks:** Next.js build, Playwright e2e, bundle-size budgets from `ci-all.yml`.

## 4. Shared APIs & Contracts
- **OpenAPI / SDK Schema:** Bump version when response/request structures change. Track canonical version in `docs/Customer-Facing/API-Reference/authentication.md` and `backend/openapi.yaml`.
- **ML/Analytics Schemas:** Follow the same MAJOR/MINOR/PATCH semantics, recorded in `data/schemas/README.md`.

## 5. Release Checklist
1. Update relevant package versions (`npm version`, `swift package tools-version`, etc.).
2. Regenerate changelog entries under `CHANGELOG.md` or surface-specific logs.
3. Tag repository: `git tag backend@1.4.0 && git push --tags`.
4. Dispatch release workflows (e.g., `release-sdks.yml`).
5. Post summary referencing FIX IDs and acceptance gates.

## Evidence
- `docs/Release/CI_RELEASE_GUIDE.md` — workflow details per surface.
- `.github/workflows/sdk-release.yml`, `.github/workflows/release-sdks.yml` — automated enforcement.
- `docs/Internal/Development/DEVELOPMENT.md` — governance cross-links.
