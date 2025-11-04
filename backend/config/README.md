# Configuration Service

OTA-proof configuration service with Ed25519 signing, staged rollouts, and automatic rollback.

## Features

- ✅ **Cryptographic Signing**: Ed25519 signatures for all configs
- ✅ **Staged Rollouts**: 1% → 5% → 25% → 100% with monitoring
- ✅ **Automatic Rollback**: Triggers on SLO breach (<15 minutes)
- ✅ **Kill Switches**: Global, adapter-level, and placement-level
- ✅ **Schema Validation**: Protobuf schema enforcement

## Architecture

```
┌──────────────┐
│   Mobile SDK  │
└──────┬───────┘
       │ Request Config
       ▼
┌──────────────────────┐
│  Config Service      │
│                      │
│  • Verify signature  │
│  • Check rollout %   │
│  • Apply killswitch  │
│  • Validate schema   │
└──────┬───────────────┘
       │
       ▼
┌──────────────┐
│    Redis     │
│  (Routing)   │
└──────────────┘
```

## API Endpoints

### Get Configuration
```bash
GET /v1/config/{app_id}
```

Response:
```json
{
  "config_id": "cfg_abc123",
  "version": 42,
  "payload": {...},
  "signature": "base64_signature",
  "signed_at": "2025-01-01T00:00:00Z"
}
```

### Deploy Configuration
```bash
POST /v1/config
Content-Type: application/json

{
  "config_id": "cfg_new_001",
  "payload": {...},
  "stages": [
    {"name": "canary", "percentage": 0.01, "duration_min": 30},
    {"name": "early", "percentage": 0.05, "duration_min": 60},
    {"name": "expanded", "percentage": 0.25, "duration_min": 120},
    {"name": "full", "percentage": 1.00}
  ]
}
```

### Activate Kill Switch
```bash
POST /v1/killswitch/{type}/{id}
```

Types: `global`, `adapter`, `placement`

## Running Locally

```bash
# Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Run service
cd backend/config
go run cmd/main.go
```

## Environment Variables

- `PORT`: Server port (default: 8081)
- `SIGNING_KEY_PATH`: Path to Ed25519 private key
- `REDIS_ADDR`: Redis address (default: localhost:6379)
- `ENV`: Environment (development/production)

## SLO Targets

| Metric | Target |
|--------|--------|
| Crash-Free Rate | ≥99.8% |
| ANR Rate | ≤0.05% |
| P99 Latency | ≤150ms |

## Rollback Triggers

Automatic rollback occurs if any SLO is breached during staged rollout:
- Crash-free rate drops below 99.8%
- ANR rate exceeds 0.05%
- P99 latency exceeds 150ms
- Manual trigger via API

## Testing

```bash
# Unit tests
go test ./...

# Integration tests
go test -tags=integration ./...
```

## Monitoring

Prometheus metrics exposed at `/metrics`:
- `config_requests_total`
- `config_rollout_stage`
- `config_rollback_total`
- `killswitch_active`
