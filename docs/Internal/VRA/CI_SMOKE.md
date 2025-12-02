VRA CI Smoke — Backend-Only

Purpose
- Keep CI fast and green for VRA scope by running only backend Jest with DB/CH-heavy tests disabled by default. Enable DB/observability suites explicitly when needed.

Default command (repo root)
- npm run test:backend

Optional: enable DB/observability suites
- FORCE_DB_SETUP=true RUN_MIGRATIONS_IN_TEST=true npm run test:backend

Quality-of-life envs
- LOG_LEVEL=warn — reduce Jest console noise
- VRA_LARGEN=1 — enable large-N matching performance sanity (off by default)

Notes
- Do not fail CI on ClickHouse availability; remaining references degrade to empty results and no longer depend on dedicated migrations.
- Postgres migrations continue to run via `npm --prefix backend run migrate`; no separate ClickHouse step exists anymore.
- CLI guardrail tests under backend/scripts/__tests__ are included automatically by npm run test:backend

Optional canary smoke (read‑only)
- You can run a lightweight HTTP smoke against a staging API with VRA canary flags enabled. This is optional and read‑only.
- Script: `backend/scripts/vraCanarySmoke.sh`
- Example GitHub Actions job:
```yaml
jobs:
  vra-canary-smoke:
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Canary smoke (read-only)
        env:
          API_URL: ${{ secrets.VRA_STAGING_API_URL }}
          AUTH_TOKEN: ${{ secrets.VRA_STAGING_BEARER }}
        run: bash backend/scripts/vraCanarySmoke.sh
```

CI examples (copy-paste)

GitHub Actions (.github/workflows/vra-ci-smoke.yml)
```yaml
name: VRA CI Smoke
on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Run VRA backend smoke tests
        run: npm run test:backend
      - name: Save Jest output (optional)
        if: always()
        run: |
          test -f .output.txt && mkdir -p artifacts && cp .output.txt artifacts/jest-output.txt || true
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: vra-jest-logs
          path: artifacts/

  # Optional job to enable DB/observability suites (slower)
  backend-tests-db:
    if: github.event_name == 'workflow_dispatch' || startsWith(github.ref, 'refs/heads/ci-db-')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Run backend tests with DB suites
        run: FORCE_DB_SETUP=true RUN_MIGRATIONS_IN_TEST=true npm run test:backend
```

GitLab CI (.gitlab-ci.yml)
```yaml
stages: [test]

vra-backend-smoke:
  stage: test
  image: node:20
  cache:
    paths:
      - node_modules/
  script:
    - npm ci
    - npm run test:backend
  artifacts:
    when: always
    paths:
      - .output.txt

# Optional job (manual) for DB/observability suites
vra-backend-db:
  stage: test
  image: node:20
  rules:
    - when: manual
  script:
    - npm ci
    - FORCE_DB_SETUP=true RUN_MIGRATIONS_IN_TEST=true npm run test:backend
```

Ops note (migrations)
- Only Postgres migrations remain in scope. Run `npm --prefix backend run migrate` (or the secure variant) as part of your usual DB setup; no additional ClickHouse commands are required.