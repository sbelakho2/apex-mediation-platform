package ml

import (
	"testing"
	"time"
)

func TestPromotionRulesEvaluate(t *testing.T) {
	rules := PromotionRules{
		MinRocAUC:              0.85,
		MinPrAUC:               0.40,
		MinPrecisionAtRecall09: 0.80,
		MinRecallAtPrecision08: 0.90,
		MinKSStatistic:         0.20,
		RequiredWindows:        4,
		ConsecutivePasses:      4,
	}

	history := []GatingMetrics{}
	if decision := rules.Evaluate(history); decision != DecisionStayShadow {
		t.Fatalf("expected stay_shadow for empty history, got %s", decision)
	}

	window := func(value float64) GatingMetrics {
		return GatingMetrics{
			GeneratedAt:           time.Now(),
			RocAUC:                0.90,
			PrAUC:                 0.50,
			PrecisionAtRecall09:   0.82,
			RecallAtPrecision08:   value,
			KSStatistic:           0.25,
			ValidationWindowsSeen: 4,
		}
	}

	history = append(history, window(0.70))
	if decision := rules.Evaluate(history); decision != DecisionStayShadow {
		t.Fatalf("expected stay_shadow when recall target not met, got %s", decision)
	}

	history = []GatingMetrics{window(0.92), window(0.94), window(0.91), window(0.93)}
	if decision := rules.Evaluate(history); decision != DecisionPromote {
		t.Fatalf("expected promote after consecutive passes, got %s", decision)
	}
}
