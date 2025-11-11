# ML Inference Service

FastAPI-based ML inference service for the Rival Ad Platform. Serves fraud detection, CTR prediction, and bid optimization models with Prometheus metrics.

## Features

- **FastAPI Framework:** High-performance async API
- **Prometheus Metrics:** Request latency, error rates, model load times
- **Health Checks:** Kubernetes-ready liveness/readiness probes
- **Structured Logging:** JSON logs via structlog
- **Docker Support:** Production-ready containerization
- **Helm Charts:** Kubernetes deployment with autoscaling

## Quick Start

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run service
uvicorn main:app --reload --port 8000

# Test endpoints
curl http://localhost:8000/health
curl http://localhost:8000/metrics
```

### Docker

```bash
# Build image
docker build -t ml-inference:latest .

# Run container
docker run -p 8000:8000 ml-inference:latest

# Test
curl http://localhost:8000/health
```

### Kubernetes Deployment

```bash
# Install via Helm
helm install ml-inference ./helm/ml-inference \
  --namespace ml \
  --create-namespace \
  --set image.tag=1.0.0

# Check status
kubectl get pods -n ml
kubectl logs -f deployment/ml-inference -n ml

# Port forward for testing
kubectl port-forward -n ml svc/ml-inference 8000:8000
```

## API Endpoints

### Health Check
```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "models_loaded": 3,
  "uptime_seconds": 12345.67
}
```

### Prometheus Metrics
```bash
GET /metrics
```

Returns Prometheus-formatted metrics.

### Fraud Detection
```bash
POST /predict/fraud
Content-Type: application/json

{
  "user_id": "user_123",
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "impressions_24h": 1000,
  "clicks_24h": 50
}
```

### CTR Prediction
```bash
POST /predict/ctr
Content-Type: application/json

{
  "placement_id": "placement_456",
  "ad_format": "banner",
  "user_segments": ["sports", "tech"],
  "time_of_day": 14,
  "day_of_week": 3
}
```

### Bid Optimization
```bash
POST /predict/bid
Content-Type: application/json

{
  "placement_id": "placement_789",
  "floor_cpm": 2.5,
  "predicted_ctr": 0.025,
  "competition_level": "medium",
  "budget_remaining": 1000.0
}
```

## Metrics

Available Prometheus metrics:

- `ml_inference_requests_total` - Total inference requests by model and status
- `ml_inference_duration_seconds` - Histogram of inference latency
- `ml_inference_errors_total` - Error count by model and type
- `ml_model_load_time_seconds` - Model load time gauge
- `ml_active_models` - Number of loaded models

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `MODEL_DIR` | `/app/models` | Directory containing model files |
| `PORT` | `8000` | HTTP server port |
| `WORKERS` | `2` | Number of Uvicorn workers |

## Model Loading

Models are loaded from the `models/` directory on startup. Expected structure:

```
models/
  fraud_detection/
    1.0.0/
      model.onnx
      metadata.json
  ctr_prediction/
    1.0.0/
      model.onnx
      metadata.json
  bid_optimization/
    1.0.0/
      model.onnx
      metadata.json
```

## Monitoring

### Grafana Dashboard

Import the ML Inference dashboard from `monitoring/grafana/ml-inference.json` for visualization of:

- Request rate and latency
- Error rates by model
- Model load times
- Resource utilization

### Alerts

Configure Prometheus alerts for:

- High inference latency (p95 > 100ms)
- Error rate > 1%
- Model load failures

## Development

### Adding New Models

1. Create prediction endpoint in `main.py`
2. Add Pydantic request/response models
3. Implement inference logic
4. Add Prometheus metrics
5. Update tests and documentation

### Testing

```bash
# Run unit tests
pytest tests/

# Load testing with k6
k6 run tests/load/inference-load.js
```

## Deployment

### Helm Values

Customize deployment via `values.yaml`:

```yaml
replicaCount: 3
resources:
  limits:
    cpu: 4000m
    memory: 8Gi
autoscaling:
  enabled: true
  maxReplicas: 20
```

### Canary Deployment

See [ML_CANARY_DEPLOYMENT.md](../../docs/ML_CANARY_DEPLOYMENT.md) for canary rollout strategy.

## Troubleshooting

### Model Load Failures

Check logs for model file availability:
```bash
kubectl logs -n ml deployment/ml-inference | grep "Failed to load"
```

### High Latency

1. Check resource limits
2. Review model size and complexity
3. Enable model caching
4. Increase worker count

### OOM Kills

Increase memory limits in `values.yaml`:
```yaml
resources:
  limits:
    memory: 8Gi
```

## Related Documentation

- [ML Training Guide](../../ML_TRAINING.md)
- [Model Registry](../../docs/ML/MODEL_REGISTRY.md)
- [CI/CD Release Guide](../../docs/CI/CI_RELEASE_GUIDE.md)
