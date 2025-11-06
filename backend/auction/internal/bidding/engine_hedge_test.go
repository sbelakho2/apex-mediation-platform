package bidding

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

// Test that hedged requests launch a backup and can return earlier than the slow primary
func TestRequestBidFromAdapter_HedgedReturnsEarlier(t *testing.T) {
	e := NewAuctionEngine(nil)
	// Enable hedging with a small fixed delay to avoid relying on metrics
	e.SetHedgingEnabled(true)
	e.SetHedgeDelay(20 * time.Millisecond)

	var calls int32
	// Fake requester: first call sleeps 200ms, second call sleeps 50ms, both succeed
	fake := func(ctx context.Context, req BidRequest, adapterName string) (*BidResponse, error) {
		c := atomic.AddInt32(&calls, 1)
		if c == 1 {
			time.Sleep(200 * time.Millisecond)
		} else {
			time.Sleep(50 * time.Millisecond)
		}
		return &BidResponse{BidID: "b1", RequestID: req.RequestID, AdapterName: adapterName, CPM: 1.0, Currency: "USD", ReceivedAt: time.Now()}, nil
	}
	e.SetRequester(fake)

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	start := time.Now()
	bid, err := e.requestBidFromAdapter(ctx, BidRequest{RequestID: "req-hedge"}, "admob")
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if bid == nil {
		t.Fatalf("expected bid, got nil")
	}
	// If hedging worked, elapsed should be closer to ~70ms (50ms + overhead) than 200ms
	if elapsed > 150*time.Millisecond {
		t.Fatalf("hedged request took too long: %v (calls=%d)", elapsed, calls)
	}
	// Ensure both calls likely launched (not strictly required, but sanity)
	if atomic.LoadInt32(&calls) < 2 {
		t.Fatalf("expected hedge to launch a second call, calls=%d", calls)
	}
}

// Test that unified auction does not stall waiting for slow adapters (partial aggregation)
func TestRunAuction_PartialAggregationHonorsTimeout(t *testing.T) {
	e := NewAuctionEngine(nil)
	// Hedging disabled here; we test timeout adherence
	e.SetHedgingEnabled(false)

	// Fake requester: adapter "fast" returns in 50ms; adapter "slow" attempts 500ms but respects ctx and should exit on deadline
	fake := func(ctx context.Context, req BidRequest, adapterName string) (*BidResponse, error) {
		switch adapterName {
		case "fast":
			timer := time.NewTimer(50 * time.Millisecond)
			select {
			case <-timer.C:
				return &BidResponse{BidID: "b-fast", RequestID: req.RequestID, AdapterName: adapterName, CPM: 1.5, Currency: "USD", ReceivedAt: time.Now()}, nil
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		case "slow":
			timer := time.NewTimer(500 * time.Millisecond)
			defer timer.Stop()
			select {
			case <-timer.C:
				return &BidResponse{BidID: "b-slow", RequestID: req.RequestID, AdapterName: adapterName, CPM: 2.0, Currency: "USD", ReceivedAt: time.Now()}, nil
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		default:
			return nil, nil
		}
	}
	e.SetRequester(fake)

	req := BidRequest{RequestID: "req-pa", TimeoutMS: 100, AuctionType: HeaderBidding, Adapters: []string{"fast", "slow"}}
	ctx := context.Background()

	start := time.Now()
	res, err := e.RunAuction(ctx, req)
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res == nil {
		t.Fatalf("nil result")
	}
	// Should finish within ~150ms (timeout honored) and include at least the fast bid
	if elapsed > 200*time.Millisecond {
		t.Fatalf("auction exceeded expected time: %v", elapsed)
	}
	if len(res.AllBids) == 0 {
		t.Fatalf("expected at least one bid collected before timeout")
	}
	foundFast := false
	for _, b := range res.AllBids {
		if b.AdapterName == "fast" { foundFast = true }
	}
	if !foundFast {
		t.Fatalf("expected to collect fast adapter bid before timeout; got %+v", res.AllBids)
	}
}
