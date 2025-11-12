# ML Infrastructure Quick Start Guide

## Training with Reproducibility

### Local Training
```bash
cd ML

# Install dependencies (use locked versions for reproducibility)
pip install -r requirements-lock.txt

# Train model with deterministic settings
python scripts/train_supervised_logreg.py \
  --features "ML Data/features/engineered_features.parquet" \
  --out-dir models/fraud/dev/my-experiment \
  --seed 42 \
  --calibration sigmoid \
  --penalty 1.0

# Environment snapshot will be automatically saved to:
# models/fraud/dev/my-experiment/environment_snapshot.json
```

### Check Training Artifacts
```bash
ls -la models/fraud/dev/my-experiment/
# Expected files:
# - trained_fraud_model.json (weights, bias, threshold, metrics)
# - logreg_calibrated.pkl (scikit-learn model)
# - train_meta.json (training metadata)
# - environment_snapshot.json (reproducibility info)
```

---

## Export Validation

### Validate ONNX Export
```bash
cd ML

# After exporting model to ONNX (not covered here - use your export script)
python scripts/validate_export.py \
  --model-dir ../models/fraud/latest \
  --onnx-path ../models/fraud/latest/fraud_model.onnx \
  --test-features test_data/test_features.parquet \
  --output validation_results.json \
  --pr-auc-threshold 2.0 \
  --roc-auc-threshold 2.0 \
  --latency-threshold 5.0

# Script will exit with code 1 if validation fails
```

### CI Integration
The export validation runs automatically on PRs that touch:
- `ML/**`
- `models/fraud/**`

Check the **Checks** tab on your PR for results.

---

## Inference Service

### Local Development
```bash
cd services/fraud-inference

# Install dependencies
pip install -r requirements.txt

# Set model path (or use default)
export MODEL_PATH=/path/to/fraud_model.onnx
export MODEL_META_PATH=/path/to/trained_fraud_model.json

# Run service
python main.py

# Service starts on http://localhost:8080
```

### Test Endpoints
```bash
# Health check
curl http://localhost:8080/health/ready

# Score fraud
curl -X POST http://localhost:8080/v1/score \
  -H "Content-Type: application/json" \
  -d '{
    "feature_1": 1.5,
    "feature_2": 2.3,
    "feature_3": 0.8
  }'

# Batch scoring
curl -X POST http://localhost:8080/v1/score/batch \
  -H "Content-Type: application/json" \
  -d '[
    {"feature_1": 1.5, "feature_2": 2.3, "feature_3": 0.8},
    {"feature_1": 0.5, "feature_2": 1.1, "feature_3": 1.2}
  ]'

# Prometheus metrics
curl http://localhost:8080/metrics
```

### Docker Build & Run
```bash
cd services/fraud-inference

# Build image
docker build -t fraud-inference:latest .

# Run with model volume mount
docker run -p 8080:8080 \
  -v $(pwd)/../../models/fraud/latest:/app/models:ro \
  fraud-inference:latest
```

### Deploy to Kubernetes
```bash
# Install Helm chart
helm install fraud-inference \
  infrastructure/helm/fraud-inference/ \
  --set image.repository=your-registry/fraud-inference \
  --set image.tag=v1.0.0 \
  --set model.source.pvc.claimName=fraud-models-pvc \
  --namespace ml-inference

# Check deployment
kubectl get pods -n ml-inference
kubectl logs -n ml-inference deployment/fraud-inference

# Scale manually (if not using HPA)
kubectl scale deployment fraud-inference --replicas=5 -n ml-inference

# Port-forward for testing
kubectl port-forward -n ml-inference svc/fraud-inference 8080:80
```

---

## Load Testing

### Run k6 Smoke Test
```bash
cd quality/load-tests

# Install k6 (if not installed)
# macOS: brew install k6
# Linux: snap install k6
# Windows: choco install k6

# Run smoke test against local service
k6 run \
  --env BASE_URL=http://localhost:8080 \
  fraud-smoke-test.js

# Run against staging
k6 run \
  --env BASE_URL=https://fraud-staging.apexmediation.com \
  fraud-smoke-test.js

# View results
cat /tmp/k6-fraud-smoke-results.json | jq
```

### Nightly Workflow
- Runs automatically at **2 AM UTC** daily
- Tests **staging** environment by default
- View results: **Actions** → **Nightly Fraud Inference Smoke Tests**
- Manually trigger: **Actions** → **Run workflow** → Select environment

### View Test History
```bash
# Committed test results
ls -la quality/test-results/nightly/

# Download from GitHub Actions
gh run list --workflow=nightly-fraud-smoke.yml
gh run download <run-id>
```

---

## Monitoring & Alerts

### Prometheus Queries (from Grafana)
```promql
# Request rate per endpoint
rate(fraud_inference_requests_total[5m])

# Error rate
rate(fraud_inference_errors_total[5m]) 
  / rate(fraud_inference_requests_total[5m])

# p95 latency
histogram_quantile(0.95, 
  rate(fraud_inference_duration_seconds_bucket[5m]))

# High fraud prediction rate
rate(high_fraud_predictions_total[5m]) 
  / rate(fraud_inference_requests_total[5m])
```

### HPA Status
```bash
# Check autoscaler
kubectl get hpa fraud-inference -n ml-inference

# View scaling events
kubectl describe hpa fraud-inference -n ml-inference
```

### Regression Alerts
- **GitHub Issues**: Auto-created when regression detected
- **Slack**: Configure `SLACK_WEBHOOK_URL` secret in repository settings
- **Email**: Configure notification settings in GitHub Actions

---

## Troubleshooting

### Training Fails
1. Check environment snapshot matches expected hardware
2. Verify data hashes in `environment_snapshot.json`
3. Ensure `requirements-lock.txt` is used, not `requirements.txt`

### Export Validation Fails
1. Re-export model ensuring same sklearn version
2. Check if quantization was applied (affects metrics slightly)
3. Review validation thresholds (may need adjustment for your model)

### Inference Service 503
1. Check model file exists at `MODEL_PATH`
2. Verify readiness probe passes: `curl /health/ready`
3. Check logs: `docker logs <container-id>` or `kubectl logs`

### k6 Test Timeouts
1. Increase `--timeout` parameter
2. Check network connectivity to target
3. Verify service is scaled up (not cold start)

### HPA Not Scaling
1. Verify metrics server is installed: `kubectl top nodes`
2. Check custom metrics adapter (for p95/QPS metrics)
3. Review HPA events: `kubectl describe hpa`

---

## Configuration Secrets

Set these in GitHub repository settings (Settings → Secrets → Actions):

- `SLACK_WEBHOOK_URL` - Slack webhook for regression alerts (optional)
- Any cloud credentials needed for model storage/deployment

---

## Support

For issues or questions:
1. Check logs first (`kubectl logs`, `docker logs`, GitHub Actions logs)
2. Review metrics in Grafana/Prometheus
3. File GitHub issue with reproduction steps
4. Tag `@ml-team` for urgent production issues
