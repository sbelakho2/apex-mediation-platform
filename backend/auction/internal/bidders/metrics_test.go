package bidders

import (
	"sync"
	"testing"
)

// testRecorder implements MetricsRecorder for assertions
// It is intentionally simple and safe for concurrent increments via a mutex.
type testRecorder struct {
	mu sync.Mutex

	requests map[string]int
	success  map[string]int
	noFill   map[string]int
	timeout  map[string]int
	errors   map[string]map[string]int // adapter -> reason -> count
	latency  map[string][]float64
}

func newTestRecorder() *testRecorder {
	return &testRecorder{
		requests: map[string]int{},
		success:  map[string]int{},
		noFill:   map[string]int{},
		timeout:  map[string]int{},
		errors:   map[string]map[string]int{},
		latency:  map[string][]float64{},
	}
}

func (r *testRecorder) inc(m map[string]int, k string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	m[k] = m[k] + 1
}

// MetricsRecorder interface (duplicated here to avoid import cycles if any changes occur).
// It should match the interface defined in metrics.go.
func (r *testRecorder) RecordRequest(adapter string) { r.inc(r.requests, adapter) }
func (r *testRecorder) RecordSuccess(adapter string) { r.inc(r.success, adapter) }
func (r *testRecorder) RecordNoFill(adapter string) { r.inc(r.noFill, adapter) }
func (r *testRecorder) RecordTimeout(adapter string) { r.inc(r.timeout, adapter) }
func (r *testRecorder) RecordError(adapter, reason string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	m, ok := r.errors[adapter]
	if !ok {
		m = map[string]int{}
		r.errors[adapter] = m
	}
	m[reason] = m[reason] + 1
}
func (r *testRecorder) ObserveLatency(adapter string, ms float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.latency[adapter] = append(r.latency[adapter], ms)
}

func TestMetrics_NoOpDoesNotPanic(t *testing.T) {
	// Ensure default (noop) recorder tolerates calls without crashing.
	recordRequest("admob")
	recordSuccess("admob")
	recordNoFill("admob")
	recordTimeout("admob")
	recordError("admob", "status_500")
	observeLatency("admob", 12.34)
}

func TestMetrics_CustomRecorderCapturesSignals(t *testing.T) {
	rec := newTestRecorder()
	SetMetricsRecorder(rec)

	adapter := "meta"
	recordRequest(adapter)
	observeLatency(adapter, 10.0)
	recordNoFill(adapter)
	recordError(adapter, "status_500")
	recordTimeout(adapter)
	recordSuccess(adapter)
	observeLatency(adapter, 20.0)

	// Basic assertions
	if rec.requests[adapter] != 1 {
		t.Fatalf("expected 1 request, got %d", rec.requests[adapter])
	}
	if rec.noFill[adapter] != 1 {
		t.Fatalf("expected 1 no_fill, got %d", rec.noFill[adapter])
	}
	if rec.timeout[adapter] != 1 {
		t.Fatalf("expected 1 timeout, got %d", rec.timeout[adapter])
	}
	if rec.success[adapter] != 1 {
		t.Fatalf("expected 1 success, got %d", rec.success[adapter])
	}
	if rec.errors[adapter]["status_500"] != 1 {
		t.Fatalf("expected 1 status_500 error, got %d", rec.errors[adapter]["status_500"])
	}
	if got := len(rec.latency[adapter]); got != 2 {
		t.Fatalf("expected 2 latency observations, got %d", got)
	}
}
