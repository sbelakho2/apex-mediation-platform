package bidding

import (
	"context"
	"testing"
	"time"

	"github.com/rivalapexmediation/auction/internal/bidders"
)

// Test that when hedgeDelay is not explicitly set, the engine derives it from the
// adapter's observed p95 latency via bidders.GetAdapterPercentiles().
// We pre-populate the rolling metrics recorder with synthetic latencies so that p95
// is well above the hedge request's duration, and verify that the hedge launches
// and returns earlier than the slow primary.
func TestRequestBidFromAdapter_HedgeDelayDerivedFromP95(t *testing.T) {
	// Install a fresh rolling metrics recorder and synthesize latencies for adapter "admob"
	r := bidders.NewRollingMetricsRecorder(256)
	bidders.SetMetricsRecorder(r)
	// Latencies (ms): ensure a clear p95 around ~90ms
	vals := []float64{10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 85, 90, 95, 100}
	for _, v := range vals {
		r.ObserveLatencyMS("admob", v)
	}

	e := NewAuctionEngine(nil)
	e.SetHedgingEnabled(true)
	// Intentionally do NOT set explicit hedge delay to force p95 derivation
	// e.SetHedgeDelay(0)

	// Primary sleeps long (200ms). Hedge (backup) returns fast (40ms).
	primarySlept := false
	hedgeSlept := false
	e.SetRequester(func(ctx context.Context, req BidRequest, adapterName string) (*BidResponse, error) {
		// First invocation is primary; second is hedge. We cannot directly know which is which,
		// but we can simulate two calls with different durations by toggling a flag guarded by time.After.
		if !primarySlept {
			primarySlept = true
			time.Sleep(200 * time.Millisecond)
		} else {
			hedgeSlept = true
			time.Sleep(40 * time.Millisecond)
		}
		return &BidResponse{BidID: "b", RequestID: req.RequestID, AdapterName: adapterName, CPM: 1.0, Currency: "USD", ReceivedAt: time.Now()}, nil
	})

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	start := time.Now()
	bid, err := e.requestBidFromAdapter(ctx, BidRequest{RequestID: "req-p95"}, "admob")
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if bid == nil {
		t.Fatalf("expected bid, got nil")
	}
	// Without hedging we'd wait ~200ms. With p95-derived hedge (≈90ms) and 40ms hedge runtime,
	// elapsed should be well under 200ms, typically < 150ms.
	if elapsed > 170*time.Millisecond {
		t.Fatalf("expected hedged earlier return, took %v (p95-derived delay not used?)", elapsed)
	}
	if !hedgeSlept {
		t.Fatalf("expected hedge path to be invoked at least once")
	}
}
