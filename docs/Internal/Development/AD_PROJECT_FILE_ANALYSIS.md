# AD-Project File-by-File Analysis

_Last updated: 2025-11-14 00:00 UTC_
_Owner: Platform Engineering 

## Objectives
- Provide a repeatable, auditable record of what every file in the repository does, its dependencies, and its current health.
- Capture follow-up actions (defects, debt, docs gaps) as we review individual files.
- Enable incremental updates as the codebase evolves by organizing the analysis by top-level areas.

## Scope & Order of Operations
We will progress directory by directory so that work remains reviewable and can be parallelized later if needed. Each section below mirrors the repo’s top-level layout and will be checked off once **every file** within that section has been captured in the log.

1. Root files (repository top level)
2. `backend/`
3. `console/`
4. `data/` & `ML Data/`
5. `docs/`
6. `infrastructure/`, `monitoring/`, `logs/`
7. `ML/`
8. `models/`
9. `packages/` & `Packages/`
10. `quality/`
11. `scripts/`
12. `sdk/` & `sdks/`
13. `services/`
14. `website/`
15. Remaining folders (`packages/web-sdk`, vendor SDKs, etc.)

> ⚠️ **Expectation:** Each section must contain an entry for every file (source, config, schema, migration, etc.). Generated artifacts (lockfiles, build caches) will be summarized if they are deterministic.

## Data Capture Template
For every file we will record the following fields:

| Field | Description |
| --- | --- |
| Path | Absolute path within repo |
| Type | Source / Config / Doc / Script / Asset / Generated |
| Summary | Short description of purpose and key behaviors |
| Dependencies | Notable internal/external deps referenced |
| Risks / TODOs | Bugs, debt, missing tests, stale docs, etc. |
| Evidence | Links to tests, docs, or commands validating behavior |

## Recording Method
- Use this Markdown file as the canonical log. Each top-level section below contains nested subsections mirroring the directory tree.
- Whenever we finish reviewing a file, add a bullet under its directory with the template above (concise inline format is acceptable to keep the document readable).
- Cross-link to existing docs (e.g., `docs/Internal/Development/DEVELOPMENT_TODO_CHECKLIST.md`) instead of duplicating detail.

## Progress Tracker
The following checklist mirrors the TODO list maintained in `DEVELOPMENT_TODO_CHECKLIST.md`. Update both places as you progress to keep stakeholders in sync.

- [ ] Root-level files analyzed
- [ ] `backend/`
- [ ] `console/`
- [ ] `data/` & ML datasets
- [ ] `docs/`
- [ ] `infrastructure/`, `monitoring/`, `logs/`
- [ ] `ML/`
- [ ] `models/`
- [ ] `packages/`, `Packages/`
- [ ] `quality/`
- [ ] `scripts/`
- [ ] `sdk/`, `sdks/`
- [ ] `services/`
- [ ] `website/`
- [ ] Remaining folders / verification

## Section Logs

### Root-Level Files

- `docker-compose.yml` — **Type:** Config (Docker Compose v3.9). **Summary:** Spins up backend (Node), console (Next.js), Postgres 16, Redis 7, ClickHouse 23.9, plus optional ML CPU/GPU training workers sharing the repo via bind mounts. **Dependencies:** Backend migrations auto-run via `/backend/migrations`, ML containers depend on `Dockerfile.ml*`. **Risks/TODOs:** Secrets (JWT, DB creds) are placeholder defaults; ClickHouse lacks a persistent volume; only backend is exposed to console (no website). **Evidence:** File reviewed 2025‑11‑14; run `docker compose up` for integrated stack.
- `Dockerfile.ml` — **Type:** Config (Docker image). **Summary:** Python 3.12 slim image installing `ML/requirements.txt`, copies ML + scripts, sets entrypoint to `scripts/ml/train_models.py`. **Dependencies:** Pip requirements; host repo volume when used via compose. **Risks/TODOs:** No caching between installs; CPU-only so heavy torch jobs may be slow. **Evidence:** Compose profile `ml` references this file.
- `Dockerfile.ml-gpu` — **Type:** Config. **Summary:** Based on `pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime`, installs `requirements-gpu`, same entrypoint as CPU image, requires GPU reservations. **Dependencies:** CUDA 12 drivers on host; ML GPU requirements file. **Risks/TODOs:** No healthcheck; make sure host has matching NVIDIA runtime. **Evidence:** Compose service `ml-train-gpu` references this file.
- `Makefile` — **Type:** Build tooling. **Summary:** Provides four ML-focused phony targets: `ml.fetch`, `ml.prepare`, `ml.train`, `ml.train.gpu`; wraps Python scripts and docker compose runs with overridable dataset/output vars. **Dependencies:** `PYTHON` binary, `scripts/ml/*.py`, `docker compose`. **Risks/TODOs:** No general frontend/backend targets; consider adding lint/test aggregators later. **Evidence:** Reviewed file 2025‑11‑14.
- `package.json` — **Type:** Config (npm workspace root). **Summary:** Defines workspaces (`backend`, `console`, `packages/*`, `sdk/*`, `quality/*`, `tools/*`), shared scripts for build/test/lint/migrate/dev, devDependencies (TypeScript, Jest, ESLint, Prettier, Husky). **Dependencies:** Node ≥18/NPM ≥9, husky hooks, k6 for perf tests. **Risks/TODOs:** Root scripts run `npm run build --workspaces`, which can be slow; consider pnpm/turbo for scaling. **Evidence:** File reviewed 2025‑11‑14.
- `package-lock.json` — **Type:** Generated lockfile. **Summary:** Ensures deterministic installs for root tooling + shared devDependencies. **Dependencies:** npm; covers multi-workspace tree. **Risks/TODOs:** Very large; keep updated when new deps added to avoid drift. **Evidence:** Present at root, last regenerated 2025‑11‑12 (per git log – verify when diffing).
- `start-dev.sh` — **Type:** Script. **Summary:** Bash helper that prints friendly status and launches `console` dev server with mock data using `npm run dev`. **Dependencies:** Node/npm, console workspace. **Risks/TODOs:** Only starts console (no API); consider flag to boot backend via docker compose too. **Evidence:** Script reviewed 2025‑11‑14; shebang bash.
- `local.properties` — **Type:** Config (Android SDK path). **Summary:** Points Gradle to `/home/aaron/Android/Sdk`; standard Android studio artifact, intentionally not version-controlled (ignored via `.gitignore`). **Dependencies:** Android build tooling when working on native SDK. **Risks/TODOs:** Local-only; ensure devs don’t commit updates. **Evidence:** File timestamp 2025‑11‑12.
- `.gitignore` — **Type:** Config. **Summary:** Comprehensive ignore list covering Node, Python, Android, Unity, Terraform, Docker, ML datasets (Criteo, Avazu), SBOM outputs, bundle reports, etc. **Dependencies:** Git. **Risks/TODOs:** Currently ignores `gradlew` (but re-adds `sdk/core/android/gradlew.sh`); verify no required binaries are skipped. **Evidence:** Reviewed 2025‑11‑14.
- `Logo.jpg` — **Type:** Asset. **Summary:** Brand/logo image used in docs? (binary). **Dependencies:** Consumed by marketing materials. **Risks/TODOs:** No source PSD provided; ensure licensing tracked.
- `Solo_Execution_Business_Plan_AdStack_Bel_Consulting_OU.docx` — **Type:** Doc asset. **Summary:** Business plan reference; likely external facing. **Dependencies:** MS Word. **Risks/TODOs:** Confirm whether this belongs in repo or should live in shared drive.
- `Website.docx` — **Type:** Doc asset. **Summary:** Likely legacy website content plan; verify currency vs docs/Website sections. **Risks/TODOs:** Consider migrating into Markdown for easier diffing.
- `node_modules/` — **Type:** Generated directory. **Summary:** Root dependency install location (currently committed in workspace for caching but should stay ignored). **Risks/TODOs:** Ensure `.gitignore` prevents accidental commits; prefer per-workspace installs if size grows.

### backend/

- `.env.example` — **Type:** Config template. **Summary:** Minimal dev defaults for DB, ClickHouse, Redis, JWT, transparency knobs. **Dependencies:** Local Postgres/Redis/ClickHouse; transparency writer. **Risks/TODOs:** Includes placeholder secrets; ensure developers don’t reuse in prod. **Evidence:** Reviewed 2025‑11‑14.
- `.env.sample` — **Type:** Config template (annotated). **Summary:** Extensive sample with sections for DB, Redis, CORS, Stripe, Resend, OpenAI, feature flags, monitoring. **Dependencies:** External providers (Stripe, Resend, AWS, GCP). **Risks/TODOs:** Flags default to true; warn devs before enabling expensive services. **Evidence:** Reviewed 2025‑11‑14.
- `.eslintrc.cjs` — **Type:** Lint config. **Summary:** TS ESLint setup with project-based parser, rules for async misuse, overrides for controllers/tests/services. **Dependencies:** `@typescript-eslint/*`. **Risks/TODOs:** Relies on `tsconfig.eslint.json`; ensure IDE uses same root. **Evidence:** Reviewed file.
- `.gitignore` (backend) — **Type:** Config. **Summary:** Backend-specific ignore (dist, logs, coverage, env files). **Dependencies:** Git. **Risks/TODOs:** Verify `dist/` remains excluded in CI artifacts.
- `.transparency-metrics.log` — **Type:** Log artifact. **Summary:** Captures transparency writer test run (connections, breaker trips, ClickHouse errors). **Dependencies:** Observability scripts. **Risks/TODOs:** Contains timestamps/error messages; rotate or move to logs/ to avoid repo bloat.
- `BACKGROUND_JOBS.md` — **Type:** Doc. **Summary:** 600+ line deep dive into BullMQ queues (analytics, export, reports, metrics, cache warming, cleanup) with configs, payloads, schedules. **Dependencies:** `src/queues/**/*.ts`. **Risks/TODOs:** Need to confirm queue naming issue (“Queue name cannot contain :” seen in logs) is documented with fix. **Evidence:** Reviewed overview + queue sections.
- `Dockerfile` — **Type:** Build config (broken). **Summary:** Intended to be multi-stage Node build to distroless runtime, but file is badly corrupted with Kubernetes Deployment YAML interleaved (invalid Docker syntax). **Dependencies:** Node 20, distroless runtime. **Risks/TODOs:** HIGH – cannot build as-is; needs restoration (likely missing newline separators). Blocks container builds + fly deploy. **Evidence:** File inspection shows `metadata:`/`spec:` lines inside Dockerfile.
- `Dockerfile` referenced in `fly.toml` & `deploy-backend.sh`; fix required before deployments resume.
- `deploy-backend.sh` — **Type:** Script. **Summary:** Automates Fly.io deploy (staging/prod) with CLI checks, app creation, secret prompts, region scaling, post-deploy health checks. **Dependencies:** Fly CLI, curl, sed. **Risks/TODOs:** Mutation of `fly.toml` via `sed -i` for production may dirty repo; consider using env overlays. Requires manual confirmation for secrets.
- `fly.toml` — **Type:** Infra config. **Summary:** Fly.io app config (SJC region, docker build, HTTP checks, TLS, autoscaling triggers, log volume mount). **Dependencies:** Fly platform. **Risks/TODOs:** `PORT` mismatches (8080 here vs 4000 default). Ensure runtime `CMD` binds 8080 when deployed via Fly.
- `IMPLEMENTATION_SUMMARY.md` — **Type:** Doc. **Summary:** Tracks completion of exports, A/B tests, caching, background jobs, metrics; lists files/tests/perf impacts. **Dependencies:** Various services + migrations. **Risks/TODOs:** States “All features complete”; need to keep updated as new work added.
- `REDIS_CACHING.md` — **Type:** Doc. **Summary:** Detailed caching strategy (TTL tiers, vary-by, invalidation patterns, client API). **Dependencies:** `src/utils/redis.ts`, `src/middleware/cache.ts`. **Risks/TODOs:** Example TTL table uses TypeScript pseudo-code; confirm docs match current constants.
- `openapi.yaml` — **Type:** API spec. **Summary:** 900+ line OpenAPI 3.0.3 covering auth, RTB, migration studio, billing, etc., with schemas + security definitions. **Dependencies:** `@asteasolutions/zod-to-openapi`, swagger UI. **Risks/TODOs:** Ensure spec stays aligned with feature-flagged endpoints; consider splitting by domain to reduce merge conflicts.
- `package.json` — **Type:** Config. **Summary:** Scripts for dev/build/start/test/migrations, ClickHouse helpers, transparency verification, infisical-backed secure tasks; dependencies span Express, Stripe, Redis, BullMQ, ClickHouse. **Dependencies:** Node 20, ts-node, jest. **Risks/TODOs:** Some scripts still reference legacy `runMigrations.js` (not V2); verify both paths supported. Observed formatting glitch (indented fields) but JSON valid.
- `package-lock.json` — **Type:** Lockfile. **Summary:** Deterministic dependency tree for backend service. **Dependencies:** npm. **Risks/TODOs:** Keep in sync with `package.json`; remove unused packages (e.g., `openai` if not shipped).
- `tsconfig.json` / `tsconfig.eslint.json` — **Type:** Config. **Summary:** ES2020 target, `rootDir`=repo, includes `src/services/scripts`, outputs `dist`, excludes tests from build. ESLint variant narrows include to src/tests. **Dependencies:** `typescript` 5.5. **Risks/TODOs:** Build currently skips `tests` folder entirely; OK if tests compile via jest.
- `jest.config.cjs` — **Type:** Test config. **Summary:** `ts-jest` preset, node env, serialized runs (maxWorkers=1) to avoid DB contention, setup file `src/__tests__/setup.ts`, 10s timeout. **Dependencies:** jest, ts-jest. **Risks/TODOs:** Serial tests slow; consider DB container per worker.
- `.transparency-metrics.log` indicates queue init failures due to colon in queue names; action item to sanitize queue IDs.
- `deploy-backend.sh` & `fly.toml` rely on `Dockerfile`; unresolved corruption blocks release pipeline.

### console/
> _Pending detailed review._

### data/ & ML Data/
> _Pending detailed review._

### docs/
> _Pending detailed review._

### infrastructure/, monitoring/, logs/
> _Pending detailed review._

### ML/
> _Pending detailed review._

### models/
> _Pending detailed review._

### packages/ & Packages/
> _Pending detailed review._

### quality/
> _Pending detailed review._

### scripts/
> _Pending detailed review._

### sdk/ & sdks/
> _Pending detailed review._

### services/
> _Pending detailed review._

### website/
> _Pending detailed review._

### Remaining folders / verification
> _Pending detailed review._
