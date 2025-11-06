package bidding

import (
	"context"
	"sort"
	"testing"
	"time"
)

// Test that auction runtime adheres to the TimeoutMS budget even with a single slow adapter.
// This approximates a p99 bound by running many trials and asserting the 99th percentile
// of observed runtimes does not exceed the timeout budget (with small epsilon for scheduler overhead).
func TestRunAuction_P99WithinTimeout_SingleSlowAdapter(t *testing.T) {
	e := NewAuctionEngine(nil)
	// Ensure hedging is disabled to test the partial aggregation/deadline adherence path.
	e.SetHedgingEnabled(false)

	// Fake requester: for adapter "slow", wait much longer than any timeout, but
	// respect the provided context and exit when canceled.
	fake := func(ctx context.Context, req BidRequest, adapterName string) (*BidResponse, error) {
		// Simulate a long in-flight request that only ends on context cancellation
		timer := time.NewTimer(10 * time.Second)
		defer timer.Stop()
		select {
		case <-timer.C:
			// Should not happen under the configured short timeouts
			return &BidResponse{BidID: "late", RequestID: req.RequestID, AdapterName: adapterName, CPM: 0.1, Currency: "USD", ReceivedAt: time.Now()}, nil
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	e.SetRequester(fake)

	const timeoutMS = 80
	runs := 50 // sufficient sample to approximate p99 without making the test slow
	durations := make([]time.Duration, 0, runs)
	ctx := context.Background()
	for i := 0; i < runs; i++ {
		req := BidRequest{
			RequestID:   "req-timeout-bound",
			TimeoutMS:   timeoutMS,
			AuctionType: HeaderBidding,
			Adapters:    []string{"slow"},
		}
		start := time.Now()
		_, _ = e.RunAuction(ctx, req)
		durations = append(durations, time.Since(start))
	}

	// Compute 99th percentile of durations
	vals := make([]float64, len(durations))
	for i, d := range durations { vals[i] = float64(d.Milliseconds()) }
	sort.Float64s(vals)
	idx := func(p float64) int {
		if len(vals) <= 1 { return 0 }
		pos := int(p*float64(len(vals)-1) + 0.5)
		if pos < 0 { pos = 0 }
		if pos >= len(vals) { pos = len(vals)-1 }
		return pos
	}
	p99 := vals[idx(0.99)]

	budget := float64(timeoutMS)
	// Allow small epsilon for scheduler and JSON encode/alloc overheads inside engine.
	// The epsilon is intentionally conservative to avoid flakes on slower CI VMs.
	epsilon := 30.0 // ms
	if p99 > budget+epsilon {
		t.Fatalf("p99 runtime %.1fms exceeds timeout budget %.1fms + epsilon %.1fms (runs=%d)", p99, budget, epsilon, runs)
	}
}
