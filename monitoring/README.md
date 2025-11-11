# Monitoring Stack

This directory contains the complete monitoring stack for Rival Ad Platform, including Prometheus, Grafana, Loki, Promtail, and Alertmanager.

## Architecture

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards
- **Loki**: Log aggregation
- **Promtail**: Log shipping agent
- **Alertmanager**: Alert routing and notification

## Quick Start

### Local Development

```bash
# Start the monitoring stack
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the stack
docker-compose down
```

Services will be available at:
- Grafana: http://localhost:3001 (admin/admin)
- Prometheus: http://localhost:9090
- Alertmanager: http://localhost:9093

### Production Deployment

```bash
# Deploy to production
./deploy-monitoring.sh production
```

## Dashboard Import

### Manual Import

1. Open Grafana at http://localhost:3001
2. Navigate to **Dashboards** → **Import**
3. Upload JSON files from `grafana/` directory:
   - `api_red_dashboard.json` - API RED metrics
   - `rtb-overview.json` - RTB auction metrics
   - `tracking-ingest.json` - Analytics event ingestion
   - `db-queue.json` - Database and queue health

### Automatic Provisioning (Kubernetes)

When using kube-prometheus-stack:

```bash
# Create ConfigMap with dashboards
kubectl create configmap grafana-dashboards \
  --from-file=grafana/ \
  -n monitoring

# Label for automatic discovery
kubectl label configmap grafana-dashboards \
  grafana_dashboard=1 \
  -n monitoring
```

The dashboards will be automatically loaded by Grafana's provisioning system.

## Available Dashboards

### 1. API RED & Latency (`api_red_dashboard.json`)
- HTTP request rate (RPS)
- 5xx error rates by route
- p95 latency by route

**Key Metrics:**
- `http_request_duration_seconds_count` - Request rate
- `http_request_duration_seconds_bucket` - Latency histograms

### 2. RTB Overview (`rtb-overview.json`)
- Auction latency (p50/p95/p99)
- Wins by adapter
- No-fill rates
- Adapter latency and timeouts

**Key Metrics:**
- `auction_latency_seconds` - Auction processing time
- `rtb_wins_total` - Successful bids by adapter
- `rtb_no_fill_total` - No-fill count
- `rtb_adapter_latency_seconds` - Per-adapter response times
- `rtb_adapter_timeouts_total` - Timeout counter

### 3. Tracking & Ingest (`tracking-ingest.json`)
- Analytics event pipeline (enqueued/written/failed)
- Event breakdown by kind
- Rate limiting and blocking metrics

**Key Metrics:**
- `analytics_events_enqueued_total` - Events queued
- `analytics_events_written_total` - Events persisted
- `analytics_events_failed_total` - Write failures
- `tracking_rate_limited_total` - Rate-limited requests
- `tracking_blocked_total` - Blocked requests
- `tracking_head_total` - HEAD request count

### 4. Database & Queue Health (`db-queue.json`)
- DB query latency percentiles
- Slow query detection (>1s)
- Queue depth and backlog age
- Processing rates

**Key Metrics:**
- `db_query_duration_seconds` - Query execution time
- `queue_depth` - Current queue size
- `queue_oldest_job_timestamp` - Backlog age
- `queue_jobs_completed_total` - Processing throughput
- `queue_jobs_failed_total` - Job failures

## Alerting

### Alertmanager Configuration

Alerts are defined in `alerts.yml` and loaded by Prometheus. See the [Alerts Documentation](../docs/Monitoring/ALERTS.md) for details.

### Wiring Alertmanager

1. **Configure receivers** in `alertmanager.yml`:

```yaml
receivers:
  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
        channel: '#alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
        severity: '{{ .GroupLabels.severity }}'
```

2. **Route alerts** by severity:

```yaml
route:
  receiver: 'slack'
  group_by: ['alertname', 'cluster']
  group_wait: 10s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      repeat_interval: 15m
    - match:
        severity: warning
      receiver: 'slack'
```

3. **Apply configuration**:

```bash
# Local
docker-compose restart alertmanager

# Kubernetes
kubectl apply -f alertmanager-config.yaml -n monitoring
```

### Testing Alerts

```bash
# Trigger a test alert
curl -H 'Content-Type: application/json' -d '[{
  "labels": {
    "alertname": "TestAlert",
    "severity": "warning"
  },
  "annotations": {
    "summary": "Test alert from monitoring stack"
  }
}]' http://localhost:9093/api/v1/alerts
```

## Prometheus Configuration

### Scrape Targets

The `prometheus.yml` file defines scrape targets:

```yaml
scrape_configs:
  - job_name: 'backend'
    static_configs:
      - targets: ['backend:3000']
  
  - job_name: 'auction'
    static_configs:
      - targets: ['auction:8080']
  
  - job_name: 'analytics'
    static_configs:
      - targets: ['analytics:8081']
```

### Adding New Metrics

1. Instrument your service with Prometheus client library
2. Expose metrics at `/metrics` endpoint
3. Add scrape target to `prometheus.yml`
4. Reload Prometheus: `docker-compose kill -s HUP prometheus`

## Loki & Promtail

### Log Collection

Promtail collects logs from:
- Docker containers (`/var/lib/docker/containers`)
- Application log files (`/var/log`)

### Querying Logs in Grafana

1. Add Loki as data source (automatically provisioned)
2. Use LogQL queries:

```logql
# All logs from backend service
{job="backend"}

# Error logs only
{job="backend"} |= "error"

# Aggregated error rate
sum(rate({job="backend"} |= "error" [5m]))
```

## Kubernetes Deployment (kube-prometheus-stack)

### Install Helm Chart

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f kubernetes-values.yaml
```

### Dashboard Provisioning

Create a ConfigMap with sidecar labels:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: rival-dashboards
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  rtb-overview.json: |
    <dashboard JSON content>
```

The Grafana sidecar will automatically load dashboards with the `grafana_dashboard: "1"` label.

### ServiceMonitor for Custom Services

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: backend-metrics
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: backend
  endpoints:
    - port: metrics
      interval: 30s
```

## Troubleshooting

### Prometheus Not Scraping Targets

1. Check target status: http://localhost:9090/targets
2. Verify network connectivity: `docker-compose exec prometheus wget -O- http://backend:3000/metrics`
3. Check Prometheus logs: `docker-compose logs prometheus`

### Grafana Dashboards Not Loading

1. Verify dashboard JSON is valid
2. Check Grafana logs: `docker-compose logs grafana`
3. Manually import via UI to test

### Alerts Not Firing

1. Check alert rules: http://localhost:9090/alerts
2. Verify Alertmanager config: http://localhost:9093/#/status
3. Test alert manually (see Testing Alerts above)

### High Cardinality Metrics

If Prometheus is consuming too much memory:

1. Reduce scrape frequency in `prometheus.yml`
2. Add metric relabeling to drop high-cardinality labels
3. Use recording rules to pre-aggregate metrics

## Maintenance

### Backup

```bash
# Backup Prometheus data
docker-compose exec prometheus tar -czf /tmp/prometheus-backup.tar.gz /prometheus

# Copy to host
docker cp $(docker-compose ps -q prometheus):/tmp/prometheus-backup.tar.gz ./backups/

# Backup Grafana dashboards (exported automatically to grafana/)
```

### Retention Policy

Default retention: 15 days. Adjust in `prometheus.yml`:

```yaml
command:
  - '--storage.tsdb.retention.time=30d'
  - '--storage.tsdb.retention.size=50GB'
```

## Additional Resources

- [Grafana Dashboards Documentation](../docs/Monitoring/GRAFANA_DASHBOARDS.md)
- [Alerts Documentation](../docs/Monitoring/ALERTS.md)
- [Prometheus Query Guide](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Provisioning Docs](https://grafana.com/docs/grafana/latest/administration/provisioning/)
