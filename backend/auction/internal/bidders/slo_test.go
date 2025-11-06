package bidders

import (
	"testing"
	"time"
)

func TestSLOEvaluator_ClassifiesLevels(t *testing.T) {
	// 1s buckets, 1m retention for test
	ts := NewTimeSeriesAggregator(1*time.Second, 60*time.Second)
	SetTimeSeriesAggregator(ts)
	adapter := "unity"
	now := time.Now().UTC()
	// Create 10 buckets
	for i := 0; i < 10; i++ {
		ts.withBucket(adapter, now.Add(time.Duration(i)*time.Second), func(b *TimeSeriesBucket) {
			// 100 requests per bucket
			b.Requests += 100
			// success 80, errors 10, nofill 10 (10% error rate => WARN per thresholds)
			b.Success += 80
			b.NoFill += 10
			if b.Errors == nil { b.Errors = map[string]int{} }
			b.Errors["error"] += 10
			// Latency mostly 200-400ms, making p99 ~400 => OK vs WARN threshold 600ms
			b.LatBins = [8]int{0, 0, 10, 60, 25, 5, 0, 0}
		})
	}
	statuses := EvaluateSLO(10 * time.Second)
	if len(statuses) != 1 {
		t.Fatalf("expected 1 adapter, got %d", len(statuses))
	}
	s := statuses[0]
	if s.Adapter != adapter {
		t.Fatalf("unexpected adapter %s", s.Adapter)
	}
	if s.Level != SLOWarn {
		t.Fatalf("expected WARN due to 10%% error rate, got %s (errRate=%.2f)", s.Level, s.ErrorRate)
	}

	// Now push latency to critical by adding many +Inf samples
	ts.withBucket(adapter, now.Add(20*time.Second), func(b *TimeSeriesBucket) {
		b.Requests += 100
		b.Success += 100
		b.LatBins = [8]int{0,0,0,0,0,0,0,100}
	})
	statuses = EvaluateSLO(30 * time.Second)
	if statuses[0].Level != SLOCrit {
		t.Fatalf("expected CRIT due to extreme p99, got %s (p99=%.1f)", statuses[0].Level, statuses[0].LatencyP99MS)
	}
}
