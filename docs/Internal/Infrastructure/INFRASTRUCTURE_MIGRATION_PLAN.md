# Infrastructure Migration Plan: Ultra-Lean Stack
## Goal: $175-300/month operational costs, break-even at 2 customers

**Current State**: Traditional expensive stack ($1,100-3,050/month)
**Target State**: Solo operator optimized stack ($175-300/month)
**Savings**: 85% cost reduction, 2x faster break-even

---

## Migration Phases

### Phase 1: Core Infrastructure Migration (Week 1-2)
**Goal**: Migrate primary services to cost-effective alternatives
**Cost Impact**: -$400-800/month

#### 1.1 Application Hosting: Fly.io Migration
**From**: AWS EC2 ($100-300/month) or Heroku ($50-250/month)
**To**: Fly.io ($14-50/month)

**Fly.io Pricing**:
- 2× shared-cpu-1x VMs (256MB RAM): $0/month (free tier)
- 2× shared-cpu-2x VMs (512MB RAM): $7/month each = $14/month
- 2× dedicated-cpu-1x VMs (2GB RAM): $25/month each = $50/month (if needed for scale)

**Migration Steps**:
```bash
# 1. Install Fly CLI
curl -L https://fly.io/install.sh | sh

# 2. Login and create Fly app
fly auth login
fly launch --name apexmediation-backend --region sjc --no-deploy

# 3. Configure fly.toml
cat > fly.toml <<EOF
app = "apexmediation-backend"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [services.concurrency]
    type = "connections"
    hard_limit = 250
    soft_limit = 200

  [[services.tcp_checks]]
    interval = "10s"
    timeout = "2s"
    grace_period = "5s"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
EOF

# 4. Set secrets
fly secrets set DATABASE_URL=$DATABASE_URL \\
  STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY \\
  RESEND_API_KEY=$RESEND_API_KEY \\
  JWT_SECRET=$JWT_SECRET

# 5. Deploy
fly deploy --ha=false # Single region, 1 VM for testing

# 6. Scale after validation
fly scale count 2 # 2 VMs for high availability
fly autoscale balanced min=2 max=10 # Auto-scale on load
EOF
```

**Verification**:
```bash
# Check deployment status
fly status

# View logs
fly logs

# Open in browser
fly open

# SSH into VM
fly ssh console

# Check health
curl https://apexmediation-backend.fly.dev/health
```

**Rollback Plan**:
- Keep old infrastructure running during migration
- Dual-run for 1 week with traffic split
- Full rollback if latency >200ms or errors >0.5%

---

#### 1.2 Database: Supabase PostgreSQL
**From**: AWS RDS ($50-200/month) or Heroku Postgres ($50-250/month)
**To**: Supabase Pro ($25/month)

**Supabase Pro Includes**:
- 8GB database
- 100GB bandwidth
- 50GB file storage
- Daily backups (7-day retention)
- Point-in-time recovery
- Database branching (for staging)

**Migration Steps**:
```bash
# 1. Create Supabase project
# Visit https://supabase.com/dashboard
# Click "New Project" → Name: "apexmediation" → Region: "US West (Oregon)"
# Save connection strings

# 2. Export existing database
pg_dump $OLD_DATABASE_URL > backup_$(date +%Y%m%d).sql

# 3. Import to Supabase
psql $SUPABASE_DATABASE_URL < backup_$(date +%Y%m%d).sql

# 4. Run migrations
for migration in backend/database/migrations/*.sql; do
  echo "Running $migration..."
  psql $SUPABASE_DATABASE_URL -f "$migration"
done

# 5. Verify data integrity
psql $SUPABASE_DATABASE_URL -c "\\dt" # List tables
psql $SUPABASE_DATABASE_URL -c "SELECT COUNT(*) FROM users;"
psql $SUPABASE_DATABASE_URL -c "SELECT COUNT(*) FROM subscriptions;"

# 6. Update application DATABASE_URL
fly secrets set DATABASE_URL=$SUPABASE_DATABASE_URL

# 7. Test connections
npm run test:db
```

**Performance Tuning**:
```sql
-- Enable connection pooling (Supabase uses PgBouncer)
-- Update pool size in app
-- backend/db/pool.ts
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Supabase Pro supports 60 connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

-- Create indexes for critical queries
CREATE INDEX CONCURRENTLY idx_usage_records_customer_date 
  ON usage_records(customer_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_events_type_created 
  ON events(event_type, created_at DESC) WHERE processed = false;
```

---

#### 1.3 Analytics Database: ClickHouse Cloud
**From**: Self-hosted ClickHouse on EC2 ($100-200/month) or BigQuery ($50-150/month)
**To**: ClickHouse Cloud ($50-100/month)

**ClickHouse Cloud Pricing**:
- Development tier: $50/month (24GB RAM, 100GB storage)
- Production tier: $100/month (96GB RAM, 200GB storage)
- Pay-per-query for additional usage

**Migration Steps**:
```bash
# 1. Create ClickHouse Cloud project
# Visit https://clickhouse.cloud/
# Create project → Region: "US West"

# 2. Export existing ClickHouse data
clickhouse-client --host=$OLD_CH_HOST --query="SELECT * FROM impressions FORMAT CSV" > impressions.csv
clickhouse-client --host=$OLD_CH_HOST --query="SELECT * FROM clicks FORMAT CSV" > clicks.csv
clickhouse-client --host=$OLD_CH_HOST --query="SELECT * FROM revenue FORMAT CSV" > revenue.csv

# 3. Create tables in ClickHouse Cloud
clickhouse-client --host=$NEW_CH_HOST --secure --password=$CH_PASSWORD < backend/database/clickhouse/schema.sql

# 4. Import data
clickhouse-client --host=$NEW_CH_HOST --secure --password=$CH_PASSWORD --query="INSERT INTO impressions FORMAT CSV" < impressions.csv
# Repeat for clicks, revenue tables

# 5. Update application CLICKHOUSE_URL
fly secrets set CLICKHOUSE_URL=$NEW_CLICKHOUSE_URL CLICKHOUSE_PASSWORD=$CH_PASSWORD

# 6. Verify queries
curl -X POST "https://apexmediation-backend.fly.dev/api/analytics/dashboard" \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"start_date": "2025-10-01", "end_date": "2025-11-01"}'
```

---

#### 1.4 Cache: Upstash Redis
**From**: AWS ElastiCache ($50-150/month) or Redis Cloud ($60-200/month)
**To**: Upstash Redis ($10-20/month)

**Upstash Pricing**:
- Pay-per-request model
- Free tier: 10,000 requests/day
- Pro: $10/month for 100K requests/day
- Enterprise: $20/month for 1M requests/day

**Migration Steps**:
```bash
# 1. Create Upstash database
# Visit https://console.upstash.com/
# Click "Create Database" → Name: "apexmediation-cache" → Region: "US West"

# 2. Install Upstash Redis client
cd backend
npm install @upstash/redis

# 3. Update Redis client
# backend/lib/redis.ts
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

# 4. Migrate cache data (optional, cache can be empty)
# No migration needed - cache is ephemeral

# 5. Update environment variables
fly secrets set UPSTASH_REDIS_URL=$UPSTASH_URL UPSTASH_REDIS_TOKEN=$UPSTASH_TOKEN

# 6. Test cache operations
npm run test:cache
```

---

### Phase 2: Monitoring & Observability (Week 3)
**Goal**: Replace Datadog ($50-200/month) with self-hosted stack ($0/month on Fly.io)
**Cost Impact**: -$50-200/month

#### 2.1 Self-Hosted Monitoring: Grafana + Prometheus + Loki
**From**: Datadog ($50-200/month)
**To**: Self-hosted on Fly.io ($0 - runs on existing VMs)

**Architecture**:
```
┌─────────────────┐
│  Backend VMs    │──metrics──▶┌──────────────┐
│  (Express.js)   │            │  Prometheus  │──query──▶┌──────────┐
└─────────────────┘            │  (scraper)   │          │ Grafana  │
                               └──────────────┘          │  (UI)    │
┌─────────────────┐                                      └──────────┘
│  Console VMs    │──logs────▶┌──────────────┐                ▲
│  (Next.js)      │            │     Loki     │────query───────┘
└─────────────────┘            │ (log store)  │
                               └──────────────┘
```

**Setup**:
```bash
# 1. Create monitoring VM on Fly.io
fly launch --name apexmediation-monitoring --region sjc --no-deploy

# 2. Create docker-compose.yml for monitoring stack
cat > monitoring/docker-compose.yml <<EOF
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'
  
  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    volumes:
      - ./loki-config.yml:/etc/loki/local-config.yaml
      - loki-data:/loki
  
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=\${GRAFANA_PASSWORD}
      - GF_INSTALL_PLUGINS=grafana-piechart-panel
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana-datasources.generated.yml:/etc/grafana/provisioning/datasources/datasources.yml

volumes:
  prometheus-data:
  loki-data:
  grafana-data:
EOF

# 3. Configure Prometheus scraping
cat > monitoring/prometheus.yml <<EOF
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'backend'
    static_configs:
      - targets:
        - 'apexmediation-backend.fly.dev:8080'
        metrics_path: '/metrics'
  
  - job_name: 'console'
    static_configs:
      - targets:
        - 'apexmediation-console.fly.dev:3000'
        metrics_path: '/metrics'
EOF

# 4. Deploy monitoring stack
cd monitoring
fly deploy

# 5. Access Grafana
fly open # Opens https://apexmediation-monitoring.fly.dev:3000
# Login: admin / $GRAFANA_PASSWORD

# 6. Import dashboards
# Backend API: Dashboard ID 11159 (Node.js Application)
# PostgreSQL: Dashboard ID 9628 (PostgreSQL Database)
# System: Dashboard ID 1860 (Node Exporter Full)
```

---

#### 2.2 Error Tracking: Self-Hosted GlitchTip
**From**: Sentry paid tier ($26-80/month)
**To**: GlitchTip self-hosted on Fly.io ($0/month)

**GlitchTip Features**:
- Unlimited events (vs Sentry's 100K/month limit)
- Same SDKs as Sentry (drop-in replacement)
- Error tracking, performance monitoring, uptime checks
- Open source (MIT license)

**Setup**:
```bash
# 1. Create GlitchTip VM
fly launch --name apexmediation-errors --region sjc --no-deploy

# 2. Create docker-compose.yml
cat > glitchtip/docker-compose.yml <<EOF
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: glitchtip
      POSTGRES_USER: glitchtip
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
  
  web:
    image: glitchtip/glitchtip:latest
    depends_on:
      - postgres
      - redis
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgres://glitchtip:\${DB_PASSWORD}@postgres/glitchtip
      REDIS_URL: redis://redis:6379/0
      SECRET_KEY: \${SECRET_KEY}
      PORT: 8000
      EMAIL_URL: smtp://\${SMTP_USER}:\${SMTP_PASSWORD}@smtp.resend.com:587
      GLITCHTIP_DOMAIN: https://errors.apexmediation.com
      DEFAULT_FROM_EMAIL: errors@apexmediation.com

volumes:
  postgres-data:
EOF

# 3. Deploy GlitchTip
cd glitchtip
fly secrets set SECRET_KEY=$(openssl rand -hex 32) DB_PASSWORD=$(openssl rand -hex 16)
fly deploy

# 4. Initialize GlitchTip
fly open # Opens https://errors.apexmediation.com
# Create admin account
# Create organization "ApexMediation"
# Create project "Backend"

# 5. Get DSN (Data Source Name)
# Settings → Client Keys (DSN) → Copy DSN

# 6. Update backend to use GlitchTip
npm install @sentry/node # GlitchTip uses Sentry SDK
# backend/lib/errors.ts
import * as Sentry from '@sentry/node';
Sentry.init({
  dsn: process.env.GLITCHTIP_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

# 7. Update environment variables
fly secrets set GLITCHTIP_DSN=$GLITCHTIP_DSN

# 8. Test error reporting
curl -X POST https://apexmediation-backend.fly.dev/api/test/error
# Check GlitchTip dashboard for error event
```

---

### Phase 3: Email & Marketing Infrastructure (Week 4)
**Goal**: Replace expensive SaaS tools with self-hosted alternatives
**Cost Impact**: -$300-500/month

#### 3.1 Email Marketing: Listmonk
**From**: Mailchimp ($350-500/month for 10K-50K subscribers)
**To**: Listmonk self-hosted on Fly.io ($0/month) + Resend.com for delivery (free 3K/month)

**Listmonk Features**:
- Unlimited subscribers (vs Mailchimp's tiered pricing)
- Email campaigns, newsletters, transactional emails
- List management, segmentation, analytics
- Open source (AGPL license)

**Setup**:
```bash
# 1. Create Listmonk VM
fly launch --name apexmediation-listmonk --region sjc --no-deploy

# 2. Create docker-compose.yml
cat > listmonk/docker-compose.yml <<EOF
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: listmonk
      POSTGRES_USER: listmonk
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
  
  app:
    image: listmonk/listmonk:latest
    depends_on:
      - postgres
    ports:
      - "9000:9000"
    environment:
      TZ: America/Los_Angeles
    volumes:
      - ./config.toml:/listmonk/config.toml

volumes:
  postgres-data:
EOF

# 3. Create config.toml
cat > listmonk/config.toml <<EOF
[app]
address = "0.0.0.0:9000"
admin_username = "admin"
admin_password = "$LISTMONK_PASSWORD" # Set via fly secrets

[db]
host = "postgres"
port = 5432
user = "listmonk"
password = "$DB_PASSWORD" # Set via fly secrets
database = "listmonk"
ssl_mode = "disable"

# Use Resend.com for email delivery
[[messengers]]
enabled = true
host = "smtp.resend.com"
port = 587
auth_protocol = "login"
username = "resend"
password = "$RESEND_API_KEY" # Set via fly secrets
email_format = "html"
max_conns = 10
idle_timeout = "15s"
wait_timeout = "5s"
max_msg_retries = 2
EOF

# 4. Deploy Listmonk
cd listmonk
fly secrets set DB_PASSWORD=$(openssl rand -hex 16) LISTMONK_PASSWORD=$(openssl rand -hex 16) RESEND_API_KEY=$RESEND_API_KEY
fly deploy

# 5. Initialize Listmonk
fly open # Opens https://listmonk.apexmediation.com
# Login: admin / $LISTMONK_PASSWORD
# Setup → SMTP Settings → Test Connection → ✓

# 6. Import subscriber lists
# Subscribers → Import → Upload CSV (email, name, attributes)

# 7. Create first campaign
# Campaigns → New Campaign → Name: "Welcome Series" → Schedule
```

---

#### 3.2 Workflow Automation: n8n
**From**: Zapier ($19-249/month)
**To**: n8n self-hosted on Fly.io ($0/month)

**n8n Features**:
- 280+ integrations (Stripe, Slack, GitHub, email, databases)
- Visual workflow builder
- Webhooks, cron triggers, error handling
- Open source (Fair Code license)

**Setup**:
```bash
# 1. Create n8n VM
fly launch --name apexmediation-workflows --region sjc --no-deploy

# 2. Create Dockerfile
cat > n8n/Dockerfile <<EOF
FROM n8nio/n8n:latest
USER root
RUN apk add --no-cache postgresql-client
USER node
EOF

# 3. Create fly.toml
cat > n8n/fly.toml <<EOF
app = "apexmediation-workflows"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[env]
  N8N_PORT = "5678"
  N8N_PROTOCOL = "https"
  N8N_HOST = "workflows.apexmediation.com"
  WEBHOOK_URL = "https://workflows.apexmediation.com"
  NODE_ENV = "production"
  
[[mounts]]
  source = "n8n_data"
  destination = "/home/node/.n8n"

[[services]]
  internal_port = 5678
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
EOF

# 4. Deploy n8n
cd n8n
fly deploy

# 5. Access n8n
fly open # Opens https://workflows.apexmediation.com
# Create account: owner@apexmediation.com

# 6. Example workflows to create:
# - Workflow 1: New Customer → Send Welcome Email + Create Stripe Customer
# - Workflow 2: Payment Failed → Update Status + Send Dunning Email + Alert Founder
# - Workflow 3: Usage Milestone → Celebrate + Track in ClickHouse + Notify Team
# - Workflow 4: GitHub Issue → Create Support Ticket + Notify in Discord
# - Workflow 5: Daily Report → Aggregate Stats + Email Founder + Post in Slack
```

---

### Phase 4: Status Page & Uptime Monitoring (Week 4)
**Goal**: Replace UptimeRobot paid tier ($58/month) with free alternatives
**Cost Impact**: -$58/month

#### 4.1 Status Page: Upptime (GitHub Pages)
**From**: UptimeRobot paid tier ($58/month) or Statuspage.io ($29-99/month)
**To**: Upptime on GitHub Pages ($0/month)

**Upptime Features**:
- Hosted on GitHub Pages (free, fast, reliable)
- Automated uptime monitoring via GitHub Actions
- Status page updates automatically
- Historical data (90-day uptime percentage)
- Incident management
- Open source (MIT license)

**Setup**:
```bash
# 1. Fork Upptime repository
# Visit https://github.com/upptime/upptime
# Click "Use this template" → "Create a new repository"
# Repository name: "status" (will become status.apexmediation.com)

# 2. Configure .upptimerc.yml
cat > .upptimerc.yml <<EOF
owner: apexmediation
repo: status
user-agent: upptime

sites:
  - name: Backend API
    url: https://api.apexmediation.com/health
    expectedStatusCodes:
      - 200
  
  - name: Console
    url: https://console.apexmediation.com
    expectedStatusCodes:
      - 200
  
  - name: Documentation
    url: https://docs.apexmediation.com
    expectedStatusCodes:
      - 200
  
  - name: SDK Download (iOS)
    url: https://cdn.apexmediation.com/sdk/ios/latest/ApexSDK.framework.zip
    expectedStatusCodes:
      - 200
  
  - name: SDK Download (Android)
    url: https://cdn.apexmediation.com/sdk/android/latest/apex-sdk.aar
    expectedStatusCodes:
      - 200

status-website:
  cname: status.apexmediation.com
  logoUrl: https://apexmediation.com/logo.png
  name: ApexMediation Status
  introTitle: "**Real-time status** and uptime monitoring"
  introMessage: All systems operational
  navbar:
    - title: Status
      href: /
    - title: GitHub
      href: https://github.com/apexmediation

# Notifications
notifications:
  - type: slack
    webhook-url: \${{ secrets.SLACK_WEBHOOK_URL }}
  
workflowSchedule:
  graphs: "0 0 * * *"
  responseTime: "0 23 * * *"
  staticSite: "0 1 * * *"
  summary: "0 0 * * *"
  updateTemplate: "0 0 * * *"
  updates: "0 3 * * *"
  uptime: "*/5 * * * *" # Check every 5 minutes

# Commit messages
commitMessages:
  readmeContent: ":pencil: Update summary in README [skip ci]"
  summaryJson: ":card_file_box: Update status summary [skip ci]"
  statusChange: "\${{ env.SITE_NAME }} is \${{ env.STATUS }}"
  graphsUpdate: ":bento: Update graphs [skip ci]"
EOF

# 3. Set GitHub secrets
# Settings → Secrets and variables → Actions → New repository secret
# Name: SLACK_WEBHOOK_URL, Value: https://hooks.slack.com/services/...

# 4. Enable GitHub Pages
# Settings → Pages → Source: "GitHub Actions"
# Custom domain: status.apexmediation.com

# 5. Add DNS records
# CNAME status.apexmediation.com → apexmediation.github.io

# 6. Wait for first run
# Actions tab → Wait for workflows to complete (~5 minutes)

# 7. Visit status page
# https://status.apexmediation.com

# 8. Subscribe to updates
# RSS feed: https://status.apexmediation.com/history/rss.xml
# Atom feed: https://status.apexmediation.com/history/atom.xml
```

---

### Phase 5: Analytics & Tracking (Week 5)
**Goal**: Replace Google Analytics with privacy-focused, self-hosted alternative
**Cost Impact**: $0 (self-hosted on existing infrastructure)

#### 5.1 Website Analytics: Umami or Plausible
**From**: Google Analytics (free but privacy concerns)
**To**: Umami self-hosted on Fly.io ($0/month)

**Umami Features**:
- Privacy-focused (no cookies, GDPR compliant)
- Real-time analytics dashboard
- Event tracking, goals, funnels
- Lightweight (< 2KB script)
- Open source (MIT license)

**Setup**:
```bash
# 1. Create Umami VM
fly launch --name apexmediation-analytics --region sjc --no-deploy

# 2. Create docker-compose.yml
cat > umami/docker-compose.yml <<EOF
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: umami
      POSTGRES_USER: umami
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
  
  app:
    image: ghcr.io/umami-software/umami:postgresql-latest
    depends_on:
      - postgres
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://umami:\${DB_PASSWORD}@postgres:5432/umami
      DATABASE_TYPE: postgresql
      APP_SECRET: \${APP_SECRET}
      TRACKER_SCRIPT_NAME: u.js # Obfuscate from ad blockers

volumes:
  postgres-data:
EOF

# 3. Deploy Umami
cd umami
fly secrets set DB_PASSWORD=$(openssl rand -hex 16) APP_SECRET=$(openssl rand -hex 32)
fly deploy

# 4. Initialize Umami
fly open # Opens https://analytics.apexmediation.com
# Login: admin / umami (change password immediately)

# 5. Add website
# Settings → Websites → Add Website
# Name: "ApexMediation Homepage"
# Domain: apexmediation.com
# Copy tracking code

# 6. Add tracking code to website
<script defer src="https://analytics.apexmediation.com/u.js" data-website-id="YOUR-WEBSITE-ID"></script>

# 7. Track events
umami.track('signup', { plan: 'indie' });
umami.track('sdk_download', { platform: 'ios' });

# 8. Create dashboard
# Dashboard → Custom → Add widgets (page views, unique visitors, bounce rate, top pages)
```

---

## Cost Comparison: Before vs After

### Traditional Stack (Before)
| Service | Monthly Cost | Annual Cost |
|---------|--------------|-------------|
| AWS EC2 (2× t3.medium) | $70 | $840 |
| AWS RDS PostgreSQL (db.t3.small) | $50 | $600 |
| AWS ElastiCache Redis | $50 | $600 |
| AWS S3 + CloudFront | $30 | $360 |
| Datadog | $100 | $1,200 |
| Sentry | $80 | $960 |
| SendGrid | $80 | $960 |
| Mailchimp | $350 | $4,200 |
| Zapier | $49 | $588 |
| UptimeRobot | $58 | $696 |
| **Total** | **$917/month** | **$11,004/year** |

### Ultra-Lean Stack (After)
| Service | Monthly Cost | Annual Cost |
|---------|--------------|-------------|
| Fly.io (2× VMs @ $7 each) | $14 | $168 |
| Supabase Pro (PostgreSQL) | $25 | $300 |
| ClickHouse Cloud | $50 | $600 |
| Upstash Redis | $10 | $120 |
| Cloudflare R2 (storage) | $5 | $60 |
| Resend.com (email) | $0 | $0 (free 3K/mo) |
| Fly.io (monitoring VM) | $7 | $84 |
| Fly.io (Listmonk VM) | $7 | $84 |
| Fly.io (n8n VM) | $7 | $84 |
| Fly.io (Umami VM) | $7 | $84 |
| Backblaze B2 (backups) | $1 | $12 |
| **Total** | **$133/month** | **$1,596/year** |

### Savings
- **Monthly**: $784 saved (85% reduction)
- **Annual**: $9,408 saved
- **Break-even**: 2 customers @ $67/month avg (vs 7 customers in old stack)

---

## Rollback Plan

### If Migration Fails
1. **Keep old infrastructure running** for 2 weeks minimum
2. **Dual-run strategy**: Route 10% traffic to new stack, 90% to old
3. **Monitoring**: Compare latency, error rates, uptime between stacks
4. **Rollback triggers**:
   - Latency >200ms (old stack avg: 50-100ms)
   - Error rate >0.5% (old stack avg: 0.1%)
   - Downtime >5 minutes in 24 hours
5. **DNS switchback**: Update DNS to point back to old infrastructure (5 min TTL for fast rollback)

### Gradual Migration
- **Week 1**: Backend API (non-critical endpoints)
- **Week 2**: Database (read replicas first)
- **Week 3**: Full backend + database cutover
- **Week 4**: Console, monitoring, marketing tools
- **Week 5**: Decommission old infrastructure

---

## Success Criteria

✅ **Cost Reduction**: <$200/month operational costs (target achieved at $133/month)
✅ **Performance**: <100ms P95 latency (comparable to old stack)
✅ **Reliability**: >99.9% uptime (measured over 30 days)
✅ **Break-even**: 2 customers @ $67/month (vs 7 in old stack)
✅ **Profit Margin**: 95%+ at 100 customers ($15K MRR - $800 costs = $14.2K profit)

---

## Next Steps After Infrastructure Migration

1. **Marketing Infrastructure** (Week 6-7): Blog (Ghost), SEO tools, social media automation
2. **Growth Features** (Week 8-10): Customer health scoring, churn prediction, automated upsells
3. **DevOps Automation** (Week 11-12): Self-hosted CI/CD, automated backups, blue-green deployments
4. **Intelligence** (Week 13-14): Competitor monitoring, A/B testing, product analytics
5. **Launch Preparation** (Week 15-16): Security audit, performance testing, documentation finalization

**Total Time to Launch**: 16 weeks (4 months)
