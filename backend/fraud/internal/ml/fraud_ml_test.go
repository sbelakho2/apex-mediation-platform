package ml

import (
    "encoding/json"
    "os"
    "testing"
    "time"
)

// helper to write a trained_fraud_model.json in CWD for tests
func writeModelFile(t *testing.T, obj any) {
    t.Helper()
    data, err := json.Marshal(obj)
    if err != nil {
        t.Fatalf("failed to marshal model: %v", err)
    }
    if err := os.WriteFile("trained_fraud_model.json", data, 0o644); err != nil {
        t.Fatalf("failed to write model file: %v", err)
    }
}

func removeModelFile(t *testing.T) {
    t.Helper()
    _ = os.Remove("trained_fraud_model.json")
}

// Test that degenerate metrics force shadow mode regardless of env override
func TestShadowMode_ForcedOnDegenerateMetrics(t *testing.T) {
    defer removeModelFile(t)

    // Create a degenerate trained model file
    trained := map[string]any{
        "version":   "test-degenerate",
        "weights":   map[string]float64{"click_frequency": 1.0},
        "bias":      0.0,
        "threshold": 0.5,
        "features":  []string{"click_frequency"},
        "updated_at": time.Now(),
        "metrics": map[string]float64{
            "accuracy": 1.0,
            "precision": 0.0,
            "recall": 0.0,
            "f1_score": 0.0,
            "auc": 0.50,
        },
    }
    writeModelFile(t, trained)

    // Try to disable shadow mode via env; degenerate metrics should still force it on
    _ = os.Setenv("MLFRAUD_SHADOW_MODE", "false")
    defer os.Unsetenv("MLFRAUD_SHADOW_MODE")

    det := NewMLFraudDetector(nil)
    if !det.IsShadowMode() {
        t.Fatalf("expected shadow mode to be forced ON for degenerate metrics")
    }
}

// Test that non-degenerate metrics respect explicit shadow mode env = false
func TestShadowMode_RespectsEnvWithHealthyModel(t *testing.T) {
    defer removeModelFile(t)

    healthy := map[string]any{
        "version":   "test-healthy",
        "weights":   map[string]float64{"click_frequency": 1.0},
        "bias":      0.1,
        "threshold": 0.5,
        "features":  []string{"click_frequency"},
        "updated_at": time.Now(),
        "metrics": map[string]float64{
            "accuracy": 0.95,
            "precision": 0.85,
            "recall": 0.90,
            "f1_score": 0.875,
            "auc": 0.90,
        },
    }
    writeModelFile(t, healthy)

    _ = os.Setenv("MLFRAUD_SHADOW_MODE", "false")
    defer os.Unsetenv("MLFRAUD_SHADOW_MODE")

    det := NewMLFraudDetector(nil)
    if det.IsShadowMode() {
        t.Fatalf("expected shadow mode to be OFF for healthy model when env override is false")
    }
}
