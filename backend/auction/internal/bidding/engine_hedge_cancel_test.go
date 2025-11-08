package bidding

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

// Ensures that when the hedged (backup) request returns first, the primary request's context is canceled
// and the primary requester can exit promptly rather than lingering and risking leaks.
func TestRequestBidFromAdapter_HedgeCancelsPrimary(t *testing.T) {
	e := NewAuctionEngine(nil)
	e.SetHedgingEnabled(true)
	e.SetHedgeDelay(10 * time.Millisecond) // small delay to trigger hedge quickly

	var callIdx int32
	primaryCanceled := make(chan struct{}, 1)

	fake := func(ctx context.Context, req BidRequest, adapterName string) (*BidResponse, error) {
		i := atomic.AddInt32(&callIdx, 1)
		if i == 1 {
			// Primary: wait for cancellation
			select {
			case <-ctx.Done():
				primaryCanceled <- struct{}{}
				return nil, ctx.Err()
			case <-time.After(500 * time.Millisecond):
				// Timed out waiting for cancel — this should not happen if hedging cancels ctx
				t.Fatalf("primary request not canceled by hedge within expected time")
				return nil, ctx.Err()
			}
		}
		// Hedge: return quickly with a bid
		return &BidResponse{BidID: "b-hedge", RequestID: req.RequestID, AdapterName: adapterName, CPM: 1.0, Currency: "USD", ReceivedAt: time.Now()}, nil
	}
	e.SetRequester(fake)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	bid, err := e.requestBidFromAdapter(ctx, BidRequest{RequestID: "req-hedge-cancel"}, "admob")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if bid == nil || bid.BidID != "b-hedge" {
		t.Fatalf("expected hedge bid to win, got %+v", bid)
	}
	select {
	case <-primaryCanceled:
		// ok
	case <-time.After(200 * time.Millisecond):
		t.Fatalf("primary requester did not observe cancellation in time")
	}
}
