# Fraud Reporting System

## Overview

The Fraud Reporting System provides real-time fraud alerts, entity blocking, analytics, and webhook notifications for the fraud detection platform.

## Components

### 1. FraudReporter (`internal/reporting/fraud_reporter.go`)

Core reporting engine that handles:
- **Real-time Alerts**: Publishes fraud alerts via Redis pub/sub
- **Entity Blocking**: Blocks publishers, advertisers, devices, and IPs
- **Statistics Tracking**: Maintains fraud metrics across multiple time windows (1h, 24h, 7d, 30d)
- **Webhook Notifications**: Triggers configured webhooks on fraud events

#### Alert Types
- `givt`: General Invalid Traffic (datacenter IPs, bots)
- `sivt`: Sophisticated Invalid Traffic (click patterns, device fingerprinting)
- `ml_fraud`: Machine learning-based fraud detection
- `anomaly`: Anomaly detection

#### Severity Levels
- `low`: Minor suspicious activity
- `medium`: Moderate fraud risk
- `high`: Confirmed fraud
- `critical`: Severe fraud requiring immediate action

#### Block Statuses
- **Temporary**: Expires after specified duration
- **Permanent**: Never expires
- **Review Status**: `pending`, `reviewed`, `appealed`

### 2. HTTPWebhookClient (`internal/reporting/webhook_client.go`)

HTTP-based webhook delivery with:
- **HMAC-SHA256 Signatures**: Secure webhook authentication
- **Retry Logic**: Exponential backoff on failures
- **Custom Headers**: Configurable HTTP headers
- **Error Handling**: Proper 4xx/5xx status handling

### 3. FraudAnalytics (`internal/reporting/analytics.go`)

Advanced analytics engine providing:
- **Time Series Analysis**: Fraud metrics over configurable time periods
- **Trend Detection**: Identifies increasing/decreasing/stable fraud patterns
- **Top Fraudsters**: Ranks entities by fraud rate
- **Pattern Detection**: Detects click farms, bot networks, device farms
- **Dashboard Data**: Comprehensive fraud overview

#### Pattern Detection
1. **Click Farm**: High requests/IP ratio (>100 requests per IP)
2. **Bot Network**: Regular timing intervals indicating automation
3. **Device Farm**: Many device IDs from same IP (>50 devices)

### 4. API Handlers (`internal/api/reporting_handler.go`)

RESTful API endpoints for fraud reporting:

#### Alert Endpoints
- `POST /v1/fraud/alerts` - Publish fraud alert
- `GET /v1/fraud/alerts/{publisher_id}` - Get recent alerts

#### Blocking Endpoints
- `POST /v1/fraud/block` - Block entity
- `POST /v1/fraud/unblock` - Unblock entity
- `GET /v1/fraud/blocks/{entity_type}` - List blocked entities
- `GET /v1/fraud/check-blocked` - Check if entity is blocked

#### Statistics Endpoints
- `GET /v1/fraud/stats/{publisher_id}` - Get fraud statistics
- `GET /v1/fraud/dashboard/{publisher_id}` - Get dashboard data

#### Analytics Endpoints
- `GET /v1/fraud/trend/{publisher_id}` - Get fraud trend analysis
- `GET /v1/fraud/top-fraudsters` - Get top fraudulent entities
- `GET /v1/fraud/patterns/{publisher_id}` - Detect fraud patterns

#### Webhook Endpoints
- `POST /v1/fraud/webhooks` - Create webhook
- `GET /v1/fraud/webhooks/{webhook_id}` - Get webhook
- `PUT /v1/fraud/webhooks/{webhook_id}` - Update webhook
- `DELETE /v1/fraud/webhooks/{webhook_id}` - Delete webhook

## Data Structures

### FraudAlert
```go
{
  "id": "alert_1234567890",
  "timestamp": "2025-11-01T12:00:00Z",
  "alert_type": "ml_fraud",
  "severity": "high",
  "publisher_id": "pub_123",
  "device_id": "device_456",
  "ip_address": "192.168.1.1",
  "fraud_score": 0.85,
  "detection_type": "ml_based",
  "metadata": {
    "feature_1": 0.5,
    "feature_2": 0.8
  },
  "action": "block"
}
```

### BlockedEntity
```go
{
  "entity_type": "publisher",
  "entity_id": "pub_123",
  "blocked_at": "2025-11-01T12:00:00Z",
  "blocked_by": "system",
  "reason": "High fraud rate detected",
  "expires_at": "2025-11-08T12:00:00Z",
  "fraud_score": 0.85,
  "incident_ids": ["alert_1", "alert_2"],
  "is_active": true,
  "review_status": "pending"
}
```

### FraudStats
```go
{
  "publisher_id": "pub_123",
  "time_window": "24h",
  "total_requests": 10000,
  "fraud_requests": 150,
  "fraud_rate": 0.015,
  "givt_detections": 50,
  "sivt_detections": 30,
  "ml_detections": 70,
  "anomaly_detections": 0,
  "blocked_requests": 100,
  "flagged_requests": 50,
  "average_fraud_score": 0.72,
  "top_fraud_types": ["ml_fraud", "givt"],
  "last_updated": "2025-11-01T12:00:00Z"
}
```

### WebhookConfig
```go
{
  "id": "webhook_123",
  "publisher_id": "pub_123",
  "url": "https://example.com/webhooks/fraud",
  "secret": "webhook_secret",
  "enabled": true,
  "events": ["fraud_detected", "entity_blocked"],
  "min_severity": "medium",
  "retry_policy": {
    "max_retries": 3,
    "retry_interval": "5s",
    "backoff_factor": 2.0
  },
  "headers": {
    "X-Custom-Header": "value"
  }
}
```

## Redis Data Structure

### Keys
- `fraud:alerts` - Pub/sub channel for real-time alerts
- `fraud:alert:{alert_id}` - Individual alert (7 day TTL)
- `fraud:alerts:publisher:{publisher_id}` - Publisher's alert index (30 day TTL)
- `fraud:block:{entity_type}:{entity_id}` - Blocked entity
- `fraud:blocks:{entity_type}` - Block index by type
- `fraud:stats:{publisher_id}:{window}` - Fraud statistics
- `fraud:timeseries:{publisher_id}:{bucket}` - Time series data (30 day TTL)
- `fraud:webhooks:publisher:{publisher_id}` - Publisher's webhooks
- `fraud:webhook:{webhook_id}` - Webhook configuration

## Usage Examples

### Publish Fraud Alert
```bash
curl -X POST http://localhost:8083/v1/fraud/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "alert_type": "ml_fraud",
    "severity": "high",
    "publisher_id": "pub_123",
    "device_id": "device_456",
    "ip_address": "192.168.1.1",
    "fraud_score": 0.85,
    "detection_type": "ml_based",
    "action": "block"
  }'
```

### Block Publisher
```bash
curl -X POST http://localhost:8083/v1/fraud/block \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "publisher",
    "entity_id": "pub_123",
    "reason": "High fraud rate detected",
    "expires_at": "2025-11-08T12:00:00Z",
    "fraud_score": 0.85,
    "blocked_by": "admin"
  }'
```

### Get Fraud Statistics
```bash
curl http://localhost:8083/v1/fraud/stats/pub_123?window=24h
```

### Get Fraud Trend
```bash
curl "http://localhost:8083/v1/fraud/trend/pub_123?granularity=hourly&start=2025-11-01T00:00:00Z&end=2025-11-01T23:59:59Z"
```

### Create Webhook
```bash
curl -X POST http://localhost:8083/v1/fraud/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "publisher_id": "pub_123",
    "url": "https://example.com/webhooks/fraud",
    "secret": "webhook_secret",
    "enabled": true,
    "events": ["fraud_detected", "entity_blocked"],
    "min_severity": "medium",
    "retry_policy": {
      "max_retries": 3,
      "retry_interval": "5s",
      "backoff_factor": 2.0
    }
  }'
```

## Integration

The fraud reporting system integrates with:
1. **Fraud Detector**: Receives fraud check results
2. **ML Fraud Detector**: Receives ML prediction scores
3. **Redis**: Stores alerts, blocks, statistics
4. **Webhook Endpoints**: Notifies external systems
5. **Analytics Engine**: Powers dashboards and reports

## Performance Considerations

- **Redis Pub/Sub**: Real-time alert delivery with minimal latency
- **In-Memory Caching**: Frequently checked blocks cached in memory
- **TTL Management**: Automatic cleanup of expired data
- **Batch Operations**: Statistics updated in batches for efficiency
- **Async Webhooks**: Non-blocking webhook delivery

## Security

- **HMAC Signatures**: All webhooks signed with HMAC-SHA256
- **Entity Validation**: Input validation on all endpoints
- **Rate Limiting**: Prevents abuse of API endpoints
- **Access Control**: Publisher-scoped data isolation
- **Audit Trail**: All blocks tracked with incident IDs

## Monitoring

Key metrics to monitor:
- Alert publish rate
- Block rate by entity type
- Webhook delivery success rate
- Average fraud score
- Pattern detection frequency
- API endpoint latency

## Future Enhancements

1. **Email/SMS Alerts**: Direct notifications to publishers
2. **Appeal Workflow**: Publisher appeal process for blocks
3. **Custom Pattern Rules**: User-defined fraud patterns
4. **ML Model Integration**: Auto-block based on ML confidence
5. **Fraud Reports**: Scheduled PDF reports via email
6. **Graph Analytics**: Network analysis for fraud rings
