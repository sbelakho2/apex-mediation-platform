package bidders

import (
	"testing"
)

func TestRollingMetricsRecorder_BasicCountsAndPercentiles(t *testing.T) {
	r := NewRollingMetricsRecorder(10)
	SetMetricsRecorder(r) // also validate it satisfies MetricsRecorder via helpers

	adapter := "admob"

	// record some events
	recordRequest(adapter)
	recordRequest(adapter)
	recordNoFill(adapter)
	recordError(adapter, "status_500")
	recordTimeout(adapter)
	recordSuccess(adapter)

	// latencies (ms): intentionally unsorted with duplicates
	observeLatency(adapter, 100)
	observeLatency(adapter, 200)
	observeLatency(adapter, 300)
	observeLatency(adapter, 400)
	observeLatency(adapter, 500)

	req, succ, nf, to, errs, latN := r.Snapshot(adapter)
	if req != 2 || succ != 1 || nf != 1 || to != 1 {
		t.Fatalf("unexpected counters: req=%d succ=%d nf=%d to=%d", req, succ, nf, to)
	}
	if errs["status_500"] != 1 {
		t.Fatalf("expected one status_500 error, got %d", errs["status_500"])
	}
	if latN != 5 {
		t.Fatalf("expected 5 latency samples, got %d", latN)
	}

	p50, p95, p99 := r.Percentiles(adapter)
	// With samples [100,200,300,400,500], approximate indices yield ~300, ~500, ~500
	if p50 < 250 || p50 > 350 {
		t.Fatalf("unexpected p50: %v", p50)
	}
	if p95 < 450 || p95 > 500 {
		t.Fatalf("unexpected p95: %v", p95)
	}
	if p99 < 480 || p99 > 500 {
		t.Fatalf("unexpected p99: %v", p99)
	}
}

func TestRollingMetricsRecorder_WindowBounds(t *testing.T) {
	r := NewRollingMetricsRecorder(3)
	adapter := "meta"
	// Add 5 latencies; window=3 should retain last 3 only
	for _, ms := range []float64{10, 20, 30, 40, 50} {
		r.ObserveLatencyMS(adapter, ms)
	}
	_, _, _, _, _, latN := r.Snapshot(adapter)
	if latN != 3 {
		t.Fatalf("expected 3 samples retained, got %d", latN)
	}
	p50, _, _ := r.Percentiles(adapter)
	// Last three values are [30,40,50]; p50 should be around 40
	if p50 < 35 || p50 > 45 {
		t.Fatalf("unexpected p50 after windowing: %v", p50)
	}
}
