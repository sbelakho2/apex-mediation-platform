# Observability Stack

Comprehensive monitoring, logging, and alerting for Rival ApexMediation.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                      │
│  (SDKs, Backend Services, Console)                         │
└──────────────┬─────────────┬────────────────┬──────────────┘
               │             │                │
               ▼             ▼                ▼
        ┌──────────┐  ┌──────────┐   ┌──────────────┐
        │ Metrics  │  │  Logs    │   │   Traces     │
        │Prometheus│  │   Loki   │   │    Tempo     │
        └─────┬────┘  └────┬─────┘   └──────┬───────┘
              │            │                 │
              └────────────┴─────────────────┘
                          │
                    ┌─────▼──────┐
                    │  Grafana   │
                    │ Dashboards │
                    └─────┬──────┘
                          │
                    ┌─────▼──────┐
                    │ Alerting   │
                    │  Manager   │
                    └────────────┘
```

## Components

### 1. Metrics (Prometheus + Grafana)

**Key Metrics:**
- Request rate (QPS)
- Error rate
- P50/P95/P99 latency
- SDK crash rate
- ANR rate
- Fill rate
- eCPM
- Revenue per second
- Fraud detection rate

**Exporters:**
- Node exporter (system metrics)
- cAdvisor (container metrics)
- Custom application exporters

### 2. Logging (Loki + Promtail)

**Log Sources:**
- Application logs (structured JSON)
- Access logs (nginx)
- Audit logs (security events)
- SDK telemetry events

**Log Levels:**
- ERROR: Critical failures requiring immediate attention
- WARN: Degraded performance or approaching thresholds
- INFO: Normal operational messages
- DEBUG: Detailed diagnostic information

### 3. Tracing (Tempo + OpenTelemetry)

**Traced Operations:**
- Ad request → auction → response (full lifecycle)
- Payment processing flows
- Config updates and rollouts
- Fraud detection pipelines

### 4. Alerting

**Alert Categories:**

#### Critical (PagerDuty)
- Service down (>5min)
- Error rate >1%
- Payment processing failures
- Data loss detected
- Security breach

#### High (Slack + Email)
- ANR rate >0.02%
- P99 latency >150ms
- Fraud rate spike >50%
- Config rollback triggered
- SDK crash rate >0.2%

#### Medium (Slack)
- Fill rate drop >10%
- eCPM drop >15%
- Unusual traffic patterns
- Adapter failures

#### Low (Email)
- Certificate expiring <30 days
- Disk usage >80%
- Memory usage trending up

## Dashboards

### 1. Platform Overview
- Global QPS and latency
- Error rates by service
- Infrastructure health
- Cost metrics

### 2. SDK Performance
- Crash-free rate by version
- ANR rate by device/OS
- SDK size over time
- Adoption metrics

### 3. Auction Performance
- Bid landscape analytics
- Fill rate by placement
- eCPM trends
- Adapter performance comparison

### 4. Fraud Detection
- Fraud rate over time
- Detection method breakdown (GIVT/SIVT/ML)
- Blocked traffic by geography
- False positive rate

### 5. Payment Health
- Payout success rate by rail
- Payment processing latency
- Revenue reconciliation
- Outstanding balances

### 6. Business Metrics
- Revenue by publisher
- Revenue by geography
- Top performing placements
- Publisher retention

## SLOs & SLIs

### Service Level Objectives

| Service | SLO | Measurement |
|---------|-----|-------------|
| API Availability | 99.95% | HTTP 200 responses |
| Ad Request Latency | P99 <150ms | End-to-end auction time |
| Payment Success | 99.95% | Successful payouts / total |
| SDK Crash Rate | <0.2% | Crashes per 1000 sessions |
| ANR Rate | <0.02% | ANRs per 1000 sessions |
| Fraud Detection | >99% | Known fraud caught |

### SLI Definitions

```yaml
slis:
  - name: api_availability
    query: |
      sum(rate(http_requests_total{code=~"2.."}[5m]))
      /
      sum(rate(http_requests_total[5m]))
    
  - name: p99_latency
    query: histogram_quantile(0.99, http_request_duration_seconds_bucket)
    
  - name: error_rate
    query: |
      sum(rate(http_requests_total{code=~"5.."}[5m]))
      /
      sum(rate(http_requests_total[5m]))
```

## Alert Rules

```yaml
groups:
  - name: platform_critical
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: error_rate > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Error rate above 1% for 5 minutes"
          description: "Current error rate: {{ $value }}"
      
      - alert: HighANRRate
        expr: anr_rate > 0.0002
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "ANR rate exceeds 0.02%"
          description: "ANR rate: {{ $value }}"
      
      - alert: PaymentFailures
        expr: payment_failure_rate > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Payment failure rate above 5%"
          description: "Check payment rails immediately"
```

## Runbooks

### High Error Rate
1. Check Grafana dashboard for affected services
2. Review recent deployments (last 1h)
3. Check upstream dependencies (Redis, PostgreSQL)
4. Review error logs in Loki
5. If widespread: consider rollback
6. If isolated: restart affected pods

### Payment Processing Failure
1. Check all payment rails status
2. Verify provider API availability
3. Check ledger consistency
4. Review recent payment transactions
5. Switch to backup rail if needed
6. Notify finance team

### SDK Crash Rate Spike
1. Identify affected SDK version
2. Check crash reports in Sentry
3. Determine device/OS patterns
4. If critical: push kill switch
5. Deploy hotfix
6. Communicate with affected publishers

## Setup Instructions

### 1. Deploy Stack

```bash
# Deploy monitoring infrastructure
kubectl apply -f infrastructure/k8s/monitoring/

# Install Prometheus Operator
helm install prometheus-operator prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --values infrastructure/k8s/monitoring/prometheus-values.yaml

# Install Loki
helm install loki grafana/loki-stack \
  --namespace monitoring \
  --values infrastructure/k8s/monitoring/loki-values.yaml

# Install Tempo
helm install tempo grafana/tempo \
  --namespace monitoring \
  --values infrastructure/k8s/monitoring/tempo-values.yaml
```

### 2. Configure Grafana

```bash
# Access Grafana
kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring

# Import dashboards
curl -X POST http://admin:password@localhost:3000/api/dashboards/import \
  -H "Content-Type: application/json" \
  -d @infrastructure/grafana/dashboards/platform-overview.json
```

### 3. Setup Alerts

```bash
# Configure AlertManager
kubectl apply -f infrastructure/k8s/monitoring/alertmanager-config.yaml

# Test alerts
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{"labels":{"alertname":"TestAlert","severity":"warning"}}]'
```

## Cost Optimization

- **Retention**: 15 days raw metrics, 90 days aggregated
- **Sampling**: 1% trace sampling for high-volume endpoints
- **Log filtering**: Drop debug logs in production
- **Downsampling**: 5s → 1m → 5m → 1h granularity

## Security

- TLS encryption for all data in transit
- RBAC for dashboard access
- Audit logs for all configuration changes
- Secrets management via Kubernetes secrets
- Network policies isolating monitoring namespace
