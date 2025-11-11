# Model Registry

Central registry for all ML models used in the Rival Ad Platform.

## Directory Structure

```
models/
  <model-name>/
    <version>/
      metadata.json       # Model metadata and metrics
      model.onnx         # Exported model file
      feature_importance.json
      confusion_matrix.png
      README.md          # Version-specific documentation
```

## Available Models

### Fraud Detection
- **Latest Version:** 1.0.0
- **Purpose:** Detect fraudulent ad impressions and clicks
- **Accuracy:** 94%
- **Latency:** 5ms (p50), 12ms (p95)

### CTR Prediction
- **Latest Version:** Coming soon
- **Purpose:** Predict click-through rates for ad placements

### Bid Optimization
- **Latest Version:** Coming soon
- **Purpose:** Optimize bid amounts based on placement and competition

## Metadata Schema

Each model version includes `metadata.json` with:

```json
{
  "model_name": "string",
  "version": "semver",
  "created_at": "ISO8601",
  "framework": "string",
  "framework_version": "string",
  "export_format": "onnx|torchscript|savedmodel",
  "model_type": "classification|regression|ranking",
  "input_features": ["array"],
  "output_classes": ["array"],
  "metrics": {
    "accuracy": "float",
    "precision": "float",
    "recall": "float",
    "f1_score": "float",
    "auc_roc": "float"
  },
  "training_config": {
    "dataset_hash": "sha256",
    "training_samples": "int",
    "validation_samples": "int",
    "epochs": "int"
  },
  "deployment": {
    "inference_latency_p50_ms": "float",
    "inference_latency_p95_ms": "float",
    "model_size_mb": "float"
  },
  "validation": {
    "quantization": "string",
    "edge_device_tested": ["array"]
  },
  "deprecated": "boolean"
}
```

## Release Process

1. **Train Model:** Follow [ML_TRAINING.md](../ML_TRAINING.md)
2. **Validate:** Run validation suite
3. **Export:** Export to ONNX/TorchScript
4. **Document:** Create metadata.json with metrics
5. **Tag:** Create GitHub release with model artifacts
6. **Deploy:** Use canary deployment for gradual rollout

### Creating a Release

```bash
# Tag model version
git tag models/fraud/1.0.0

# Attach artifacts to GitHub Release
gh release create models/fraud/1.0.0 \
  --title "Fraud Detection v1.0.0" \
  --notes "See models/fraud/1.0.0/metadata.json" \
  models/fraud/1.0.0/model.onnx \
  models/fraud/1.0.0/metadata.json
```

## Deployment

Models are deployed via:

1. **ML Inference Service:** `services/inference-ml/`
2. **On-Device (SDK):** For latency-critical use cases

### Loading Models

```python
import onnxruntime as ort

# Load model
session = ort.InferenceSession('models/fraud/1.0.0/model.onnx')

# Run inference
outputs = session.run(None, {'input': features})
```

## Monitoring

Track model performance in production:

- **Inference Latency:** `ml_inference_duration_seconds`
- **Prediction Distribution:** Monitor for drift
- **Error Rates:** `ml_inference_errors_total`

## Rollback

If model performs poorly in production:

```bash
# Update canary flag to previous version
# See docs/ML_CANARY_DEPLOYMENT.md
```

## Model Versioning

Follow semantic versioning:

- **Major (X.0.0):** Breaking changes to API or features
- **Minor (0.X.0):** New features, backward compatible
- **Patch (0.0.X):** Bug fixes, retraining on same architecture

## Related Documentation

- [ML Training Guide](../ML_TRAINING.md)
- [ML Inference Service](../services/inference-ml/README.md)
- [Canary Deployment](../docs/ML_CANARY_DEPLOYMENT.md)
