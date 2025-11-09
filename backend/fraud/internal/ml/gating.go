package ml

import "time"

// PromotionDecision enumerates the action to take on the latest model candidate.
type PromotionDecision string

const (
	// DecisionStayShadow indicates the candidate must remain in shadow mode.
	DecisionStayShadow PromotionDecision = "stay_shadow"
	// DecisionCandidate signals that the model can be proposed for human review.
	DecisionCandidate PromotionDecision = "candidate_review"
	// DecisionPromote means the model satisfied all requirements to enter blocking mode.
	DecisionPromote PromotionDecision = "promote"
)

// GatingMetrics captures offline validation statistics for a trained model.
type GatingMetrics struct {
	GeneratedAt           time.Time
	RocAUC                float64
	PrAUC                 float64
	PrecisionAtRecall09   float64
	RecallAtPrecision08   float64
	KSStatistic           float64
	ValidationWindowsSeen int
}

// PromotionRules configures the thresholds that must be satisfied before promotion.
type PromotionRules struct {
	MinRocAUC              float64
	MinPrAUC               float64
	MinPrecisionAtRecall09 float64
	MinRecallAtPrecision08 float64
	MinKSStatistic         float64
	RequiredWindows        int
	ConsecutivePasses      int
}

// Evaluate inspects the metrics history and returns the gating decision.
func (r PromotionRules) Evaluate(history []GatingMetrics) PromotionDecision {
	if len(history) == 0 {
		return DecisionStayShadow
	}

	passes := 0
	for _, metrics := range history {
		if !r.satisfies(metrics) {
			passes = 0
			continue
		}
		passes++
		if passes >= r.ConsecutivePasses && metrics.ValidationWindowsSeen >= r.RequiredWindows {
			return DecisionPromote
		}
	}

	latest := history[len(history)-1]
	if r.satisfies(latest) {
		return DecisionCandidate
	}
	return DecisionStayShadow
}

func (r PromotionRules) satisfies(metrics GatingMetrics) bool {
	return metrics.RocAUC >= r.MinRocAUC &&
		metrics.PrAUC >= r.MinPrAUC &&
		metrics.PrecisionAtRecall09 >= r.MinPrecisionAtRecall09 &&
		metrics.RecallAtPrecision08 >= r.MinRecallAtPrecision08 &&
		metrics.KSStatistic >= r.MinKSStatistic
}
