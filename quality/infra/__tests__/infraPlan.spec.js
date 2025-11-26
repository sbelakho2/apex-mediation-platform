const fs = require('fs');
const path = require('path');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function exists(p) {
  return fs.existsSync(p);
}

describe('Infrastructure Migration Plan — Repository Conformance', () => {
  const repoRoot = path.resolve(__dirname, '../../../');
  const infraPlan = path.join(repoRoot, 'docs/Internal/Infrastructure/INFRASTRUCTURE_MIGRATION_PLAN.md');
  const composeProd = path.join(repoRoot, 'infrastructure/docker-compose.prod.yml');
  const nginxConf = path.join(repoRoot, 'infrastructure/nginx/apexmediation.conf');
  const nginxSslConf = path.join(repoRoot, 'infrastructure/nginx/apexmediation.ssl.conf');
  const doChecklist = path.join(repoRoot, 'docs/Internal/Infrastructure/DO_READINESS_CHECKLIST.md');
  const prodChecklist = path.join(repoRoot, 'docs/Internal/Deployment/PRODUCTION_READINESS_CHECKLIST.md');
  const localHealthScript = path.join(repoRoot, 'scripts/ops/local_health_snapshot.sh');
  const tlsScript = path.join(repoRoot, 'scripts/ops/do_tls_snapshot.sh');
  const backendIndex = path.join(repoRoot, 'backend/src/index.ts');
  const backendDeploy = path.join(repoRoot, 'backend/deploy-backend.sh');
  const backendFlyToml = path.join(repoRoot, 'backend/fly.toml');
  const consoleFlyToml = path.join(repoRoot, 'console/fly.toml');

  test('Key files exist', () => {
    expect(exists(infraPlan)).toBe(true);
    expect(exists(composeProd)).toBe(true);
    expect(exists(nginxConf)).toBe(true);
    expect(exists(nginxSslConf)).toBe(true);
    expect(exists(doChecklist)).toBe(true);
    expect(exists(prodChecklist)).toBe(true);
    expect(exists(localHealthScript)).toBe(true);
    expect(exists(tlsScript)).toBe(true);
  });

  test('Infra plan reflects Postgres-first and ClickHouse deferred', () => {
    const txt = read(infraPlan);
    expect(txt).toMatch(/1\.2\s+Database — Managed PostgreSQL/i);
    expect(txt).toMatch(/Analytics \(Postgres first\)/i);
    // Accept either phrasing "defer ClickHouse" or "avoid ClickHouse"
    expect(/defer\s+ClickHouse|avoid\s+ClickHouse/i.test(txt)).toBe(true);
    // Redis self-hosted guidance present
    expect(txt).toMatch(/Cache — Redis \(Self-Hosted/i);
    expect(txt).toMatch(/Enable authentication \(`requirepass`\)/);
  });

  test('docker-compose.prod.yml has safe local defaults and healthchecks', () => {
    const txt = read(composeProd);
    expect(txt).toMatch(/DATABASE_URL=\$\{DATABASE_URL:-postgresql:\/\/postgres:postgres@postgres:5432\/apexmediation}/);
    expect(txt).toMatch(/DATABASE_SSL=\$\{DATABASE_SSL:-false}/);
    expect(txt).toMatch(/REDIS_URL=\$\{REDIS_URL:-redis:\/\/:\$\{REDIS_PASSWORD:-local-strong-password}@redis:6379\/0}/);
    expect(txt).toMatch(/healthcheck:[\s\S]*pg_isready/);
    expect(txt).toMatch(/redis:[\s\S]*healthcheck:[\s\S]*redis-cli/);
    expect(txt).toMatch(/nginx:[\s\S]*ports:[\s\S]*\$\{NGINX_PORT:-8080}:80/);
    // Console is optional via profile
    expect(txt).toMatch(/console:[\s\S]*profiles:[\s\S]*- ui/);
  });

  test('Nginx config includes security headers and HSTS gating', () => {
    const txt = read(nginxConf);
    expect(txt).toMatch(/add_header X-Content-Type-Options nosniff/);
    expect(txt).toMatch(/add_header X-Frame-Options SAMEORIGIN/);
    expect(txt).toMatch(/add_header X-XSS-Protection/);
    // HSTS is present but commented (gated)
    expect(txt).toMatch(/#\s*add_header Strict-Transport-Security/);
    // Console upstream disabled for Phase 8
    expect(txt).toMatch(/# upstream console_upstream/);
    // Default server on 80 contains /health proxy
    expect(txt).toMatch(/server\s*{[\s\S]*listen 80 default_server;[\s\S]*location \/health[\s\S]*proxy_pass http:\/\/api_upstream\/health/m);
  });

  test('HTTPS nginx config references ssl params and metrics protection comment', () => {
    const txt = read(nginxSslConf);
    expect(txt).toMatch(/listen 443 ssl http2/);
    expect(txt).toMatch(/include \/etc\/nginx\/snippets\/ssl-params\.conf/);
    expect(txt).toMatch(/#\s+include \/etc\/nginx\/snippets\/metrics-basic-auth\.conf/);
  });

  test('Local health snapshot script captures health and Redis verify via backend container', () => {
    const txt = read(localHealthScript);
    expect(txt).toMatch(/Nginx health .*\/health/);
    // Should execute verifyRedis inside backend container
    expect(txt).toMatch(/exec backend[\s\S]*node dist\/scripts\/verifyRedis\.js/);
    // Writes verify-redis.txt and summary.txt
    expect(txt).toMatch(/verify-redis\.txt/);
    expect(txt).toMatch(/summary\.txt/);
  });

  test('DO readiness checklist contains Phase 9 verification and tooling', () => {
    const txt = read(doChecklist);
    expect(txt).toMatch(/Phase 9 — DO Readiness \(Post‑Provisioning Verification\)/);
    expect(txt).toMatch(/do_tls_snapshot\.sh/);
    expect(txt).toMatch(/HSTS.*A\/A\+/);
    expect(txt).toMatch(/\?sslmode=require/);
  });

  test('Production readiness checklist includes Post‑DO HTTPS/HSTS Verification subsection', () => {
    const txt = read(prodChecklist);
    expect(txt).toMatch(/Post‑DO HTTPS\/HSTS Verification \(Phase 9\)/);
    expect(txt).toMatch(/do_tls_snapshot\.sh/);
  });

  test('Production readiness checklist includes DigitalOcean Full Production Deployment Plan', () => {
    const txt = read(prodChecklist);
    expect(txt).toMatch(/DigitalOcean Full Production Deployment Plan \(End‑to‑End\)/);
  });

  test('TLS snapshot script writes expected evidence files', () => {
    const txt = read(tlsScript);
    expect(txt).toMatch(/verify-redirects\.txt/);
    expect(txt).toMatch(/verify-tls\.txt/);
    expect(txt).toMatch(/verify-hsts\.txt/);
  });

  test('Backend entrypoint does not import or initialize ClickHouse and health excludes it', () => {
    const txt = read(backendIndex);
    // No imports from clickhouse utils
    expect(txt).not.toMatch(/from '\.\/utils\/clickhouse'/);
    // Health services should not include clickhouse
    expect(txt).not.toMatch(/clickhouse\s*:/i);
  });

  test('Deploy script does not reference Upstash or ClickHouse', () => {
    const txt = read(backendDeploy);
    expect(/upstash/i.test(txt)).toBe(false);
    expect(/clickhouse/i.test(txt)).toBe(false);
  });

  test('Deprecated providers: Fly.io configs and script are explicitly marked deprecated', () => {
    // backend deploy script must be a deprecation shim
    const deployTxt = read(backendDeploy);
    expect(deployTxt).toMatch(/DEPRECATED/i);
    // fly.toml files, if present, must carry deprecation notice
    if (exists(backendFlyToml)) {
      const flyTxt = read(backendFlyToml);
      expect(flyTxt).toMatch(/DEPRECATION NOTICE|DEPRECATED/i);
    }
    if (exists(consoleFlyToml)) {
      const flyTxt2 = read(consoleFlyToml);
      expect(flyTxt2).toMatch(/DEPRECATION NOTICE|DEPRECATED/i);
    }
  });
});
