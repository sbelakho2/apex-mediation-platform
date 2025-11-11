package bidders

import (
	"time"
)

// SLO thresholds (can be tuned later or made env-configurable)
const (
	SLOWarnLatencyP99MS = 600.0
	SLOCritLatencyP99MS = 1000.0
	SLOWarnErrorRate    = 0.05  // 5%
	SLOCritErrorRate    = 0.10  // 10%
	SLOWarnFillRate     = 0.20  // <20% warn
	SLOCritFillRate     = 0.05  // <5% critical
)

type SLOLevel string

const (
	SLOOK   SLOLevel = "OK"
	SLOWarn SLOLevel = "WARN"
	SLOCrit SLOLevel = "CRIT"
)

// SLOStatus summarizes the current health for an adapter over a time window.
type SLOStatus struct {
	Adapter          string   `json:"adapter"`
	Window           string   `json:"window"` // e.g., "1h" or "24h"
	LatencyP99MS     float64  `json:"latency_p99_ms"`
	ErrorRate        float64  `json:"error_rate"`
	FillRate         float64  `json:"fill_rate"`
	Level            SLOLevel `json:"level"`
	// Additive fields (compatible; omitted when zero)
	ErrorBudget      float64  `json:"error_budget,omitempty"`
	ErrorBudgetUsed  float64  `json:"error_budget_used,omitempty"`
	BurnRate         float64  `json:"burn_rate,omitempty"`
}

// EvaluateSLO computes SLOs per adapter for the given window using the global time-series aggregator.
// It aggregates counters across buckets and estimates p99 using merged histogram bins.
func EvaluateSLO(window time.Duration) []SLOStatus {
	if globalTS == nil { return nil }
	// Build per-adapter merged bucket for latency and counters
	snaps := globalTS.SnapshotAll(window)
	statuses := make([]SLOStatus, 0, len(snaps))
	for _, s := range snaps {
		var merged TimeSeriesBucket
		merged.Errors = map[string]int{}
		for _, b := range s.Buckets {
			merged.Requests += b.Requests
			merged.Success += b.Success
			merged.NoFill += b.NoFill
			merged.Timeout += b.Timeout
			for i := 0; i < len(merged.LatBins); i++ { merged.LatBins[i] += b.LatBins[i] }
			if len(b.Errors) > 0 {
				for k, v := range b.Errors { merged.Errors[k] += v }
			}
		}
		latP99 := estimatePercentile(&merged, 0.99)
		errorsTotal := 0
		for _, v := range merged.Errors { errorsTotal += v }
		var errRate, fillRate float64
		if merged.Requests > 0 {
			errRate = float64(errorsTotal) / float64(merged.Requests)
			fillRate = float64(merged.Success) / float64(merged.Requests)
		}
		level := classifySLO(latP99, errRate, fillRate)
		// Compute additive SLO projections (compatible):
		// Use critical error rate as budget target (10%).
		budgetTarget := SLOCritErrorRate
		var budget, used, burn float64
		if budgetTarget > 0 {
			budget = budgetTarget
			used = errRate
			burn = errRate / budgetTarget
		}
		statuses = append(statuses, SLOStatus{
			Adapter: s.Adapter,
			Window: window.String(),
			LatencyP99MS: latP99,
			ErrorRate: errRate,
			FillRate: fillRate,
			Level: level,
			ErrorBudget: budget,
			ErrorBudgetUsed: used,
			BurnRate: burn,
		})
	}
	return statuses
}

func classifySLO(p99ms, errRate, fillRate float64) SLOLevel {
	crit := false
	warn := false
	if p99ms >= SLOCritLatencyP99MS { crit = true } else if p99ms >= SLOWarnLatencyP99MS { warn = true }
	// Treat error rate of exactly 10% as WARN; only >10% is CRIT
	if errRate > SLOCritErrorRate { crit = true } else if errRate >= SLOWarnErrorRate { warn = true }
	if fillRate <= SLOCritFillRate { crit = true } else if fillRate <= SLOWarnFillRate { warn = true }
	if crit { return SLOCrit }
	if warn { return SLOWarn }
	return SLOOK
}

// estimatePercentile computes a percentile from histogram bins on a merged bucket
func estimatePercentile(b *TimeSeriesBucket, p float64) float64 {
	total := 0
	for _, c := range b.LatBins { total += c }
	if total == 0 { return 0 }
	threshold := int(float64(total) * p)
	cum := 0
	bounds := [...]float64{25, 50, 100, 200, 400, 800, 1600, 3200}
	for i, c := range b.LatBins {
		cum += c
		if cum >= threshold {
			return bounds[i]
		}
	}
	return 3200
}
