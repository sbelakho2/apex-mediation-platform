### New Plan to Finish Part 6 — CI/CD and Monitoring (Production‑Ready, World‑Class)

#### 0) Objectives and constraints
- Complete Part 6 of DEVELOPMENT_TODO_CHECKLIST to a production‑ready bar.
- Support on‑device GPU training workflow and CPU‑only VPS/cloud deployment with incremental upgrades; retrain on device when needed.
- Keep changes backward‑compatible and non‑disruptive to already‑landed features.

#### 1) Environments and branch policy
- GitHub Actions as the CI/CD backbone; protected branches: main/master.
- Environments: dev, staging, prod; environment secrets for deploy, package registries, and probe tokens.
- Required checks: aggregate “ci‑all” (fan‑out), security scans (Dependabot + Snyk + Trivy), synthetic probes (non‑blocking), and SDK matrices.

#### 2) CI/CD consolidation and toolchain pinning
- Single gate workflow `ci-all.yml` (already added) that runs:
    - Backend: lint/unit, migrations verify (services: Postgres + ClickHouse).
    - Console: type‑check, unit/a11y.
    - SDKs: Android (unit + size + config), iOS (SwiftPM/xcodebuild), Unity (separate matrix), CTV (Android TV tests + tvOS tests).
- Pin toolchains:
    - Node: 18.x (exact); Gradle cache; JDK 17 Temurin; Xcode version pinned; Swift tools; Android SDK/NDK.
    - Unity: 2020.3/2021.3/2022.3/2023.x via game‑ci; cache Library/Packages.

#### 3) SDK CI matrices and artifacts/publishing
- Android (mobile): unit + StrictMode smoke, Dokka artifact, AAR size gate; on tag publish to GitHub Packages Maven.
- iOS: unit/UI smoke; build XCFramework; on tag attach zip to GitHub Release; SPM distribution by tag.
- Unity: test/build across matrix; IL2CPP iOS/Android smokes; size gate; upload UPM tarball to Release.
- CTV Android TV: unit, assemble, size check; on tag publish AAR to GitHub Packages.
- CTV tvOS: Swift build/test in macOS lane.

#### 4) Release/versioning orchestration
- Conventional commits + release‑please/changesets per package.
- On tag (vX.Y.Z): orchestrate build + publish of SDK artifacts (AARs, XCFramework, UPM tgz). Attach artifacts to GitHub Release.
- Backend/Console: build/push Docker images on tag; Helm chart as OCI (optional).

#### 5) Security scanning & supply chain
- Dependabot weekly updates grouped and labeled.
- Snyk for npm (root/backend/console), Gradle (sdk/**), Swift (spm), Actions; non‑blocking except CRITICAL/HIGH by policy.
- Trivy FS (now added) + image scans (backend/console) with SBOM (CycloneDX) upload; fail on CRITICAL unless waived.
- CodeQL for JS/TS + Swift/Kotlin (beta); Secret Scanning & Push Protection enabled.

#### 6) Monitoring — dashboards & alerts
- Grafana dashboards JSON under `monitoring/grafana/`:
    - API RED & p95 by route (added: api_red_dashboard.json).
    - RTB overview: `auction_latency_seconds` p50/p95, `rtb_wins_total` per adapter, `rtb_no_fill_total`, `rtb_adapter_latency_seconds` & timeouts.
    - Tracking/ingest: `analytics_events_{enqueued,written,failed}_total`, `tracking_{rate_limited,blocked,head}_total`.
    - DB: `db_query_duration_seconds` p95; queue depth panels (BullMQ sampled).
- Prometheus alert rules under `monitoring/alerts.yml`:
    - HTTP error budget burn (5m/1h), RTB p95 breach, adapter timeout spikes, ClickHouse write failures, queue backlog growth, /health down.
- README: import steps, alertmanager wiring.

#### 7) Synthetic probes & black‑box
- `synthetic-probes.yml`
    - Probes `/health` and `/api/v1/rtb/bid` (auth optional), nightly.
    - Extend for Console HTML check; environment inputs (DEV/STAGING/PROD).
    - Optional nightly k6 light runs vs staging; store JSON artifacts.

#### 8) Kubernetes/Helm observability
- Ensure backend Service port named `http`; ServiceMonitor (already added) + optional PodMonitor.
- Example values.yaml for enabling ServiceMonitor; additionalPrometheusRules for alerts.
- Optional dashboard provisioning via ConfigMaps when using kube‑prometheus‑stack.

#### 9) ML training & deployment pipeline (on‑device GPU → cloud CPU)
- Training harness under `ML/`: PyTorch with AMP; deterministic seeds; config files; CLI for local GPU runs; dataset IO contracts.
- Export: ONNX/TorchScript; quantization for CPU; validation script to compare metrics.
- Model registry: `models/<model>/<version>/metadata.json` with metrics, dataset hash; attach artifacts to Releases.
- Inference microservice (`services/inference-ml/`): FastAPI or Node; CPU‑optimized model; Prometheus metrics; Dockerfile; Helm chart; canary flag in backend to select model.
- Retraining: scheduled GitHub Action that triggers training on a self‑hosted GPU runner; rolling updates with canary.
- Monitoring: latency QPS, error rate, drift proxies; alerts for latency spikes and regression.

#### 10) Documentation & runbooks
- `docs/CI_RELEASE_GUIDE.md` (unified CI, release, publishing, rollback); `docs/Monitoring/GRAFANA_DASHBOARDS.md`; `docs/Monitoring/ALERTS.md`.
- Update `ML_TRAINING.md` with on‑device training + CPU deployment guide.
- Update DEVELOPMENT_TODO_CHECKLIST Part 6 with evidence and checkoffs.

#### 11) Acceptance criteria
- All CI lanes pass in PR; toolchains pinned; no nondeterministic flakiness.
- SDK artifacts build and publish on tag; changelogs generated; Releases include assets.
- Security scans run; CRITICAL issues block; SBOM artifacts present.
- Grafana dashboards render with live data; alerts fire under simulated thresholds.
- Synthetic probes pass nightly.
- ML pipeline documented; training/export reproducible locally; inference service deployable on CPU and emits metrics.

#### 12) Timeline & milestones
- M1 (Day 1–2): CI consolidation, services for migrations, toolchain pin; Trivy FS; finalize ci‑all gate.
- M2 (Day 2–3): Release/publish workflow for SDKs; conventional‑commits gate; GitHub Releases with assets.
- M3 (Day 3–4): Monitoring assets (dashboards + alerts) and README; extend synthetic probes.
- M4 (Day 4–5): ML harness skeleton, export, inference microservice skeleton, docs; schedule job with placeholders.
- M5 (Day 5): Dry‑run end‑to‑end; checklist updates; tag a release.

---

### What’s already landed (delta)
- Aggregate CI workflow `ci-all.yml` with Postgres/ClickHouse services for backend migrations verify; lanes for console, Android, iOS (SwiftPM), and CTV Android.
- Trivy FS workflow `security-trivy.yml`.
- Grafana API RED dashboard JSON `monitoring/grafana/api_red_dashboard.json`.
 - Tag-driven SDK release workflows present: `.github/workflows/release-sdks.yml` (Android/iOS/Unity matrices) and `.github/workflows/sdk-release.yml` (end-to-end, changelog + multi-SDK orchestration).
 - Synthetic probes workflow present: `.github/workflows/synthetic-probes.yml` probing `/health` and `/api/v1/rtb/bid` on schedule and manual dispatch.
 - Prometheus alert rules file present: `monitoring/alerts.yml` (backend, database, payments; extendable for RTB/ingest specifics).

### Next actions to complete the plan
1) Validate and finalize tag‑driven SDK releases using existing workflows:
   - Configure org/repo for GitHub Packages in Gradle (`GITHUB_PACKAGES_URL`) and set `GITHUB_TOKEN` scope; dry‑run a pre‑release tag to verify `.github/workflows/release-sdks.yml` and `.github/workflows/sdk-release.yml` produce artifacts without duplication.
   - Confirm Android (mobile + CTV) AARs publish to GitHub Packages; iOS SPM source/XCFramework asset attaches to Release; Unity UPM `.tgz` attaches to Release.
   - Decide on single‑source of truth between `release-sdks.yml` and `sdk-release.yml`, or keep both with clear scopes; document in CI guide.
2) Add remaining dashboards (RTB overview, Tracking/ingest, DB/queue) and extend Prometheus alert rules (update `monitoring/alerts.yml` with RTB p95, adapter timeouts, ClickHouse write failures, queue backlog growth) + add README under `monitoring/` with import/apply steps.
3) Extend `synthetic-probes.yml` with console HTML probe and environment selectors (DEV/STAGING/PROD base URLs via inputs/secrets); optional k6 nightly against staging with JSON artifact upload.
4) Draft docs: `docs/CI_RELEASE_GUIDE.md`, Monitoring guides (`docs/Monitoring/GRAFANA_DASHBOARDS.md`, `docs/Monitoring/ALERTS.md`), and update `ML_TRAINING.md`.
5) Optional: CodeQL workflow coverage for JS/TS + Kotlin/Swift, Trivy image scan for built images with SBOM upload, and Helm chart OCI packaging guidance.

This plan will bring Part 6 to a world‑class, production‑ready state while meeting the device‑GPU training and cloud‑CPU deployment constraints. Please confirm defaults (GitHub Actions + Kubernetes target) or provide your environment details for tailored deployment steps.