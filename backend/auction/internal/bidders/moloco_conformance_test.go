package bidders

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestMoloco_SuccessBid(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"bid": map[string]any{
				"creative_id": "moloco-cr",
				"price":       2.1,
				"markup":      "<vast/>",
			},
		})
	}))
	defer ts.Close()

	ad := NewMolocoAdapter("seat", "api-key")
	req := BidRequest{RequestID: "req-mc-1", PlacementID: "placement", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, err := ad.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if resp.NoBid {
		t.Fatalf("expected bid, got %s", resp.NoBidReason)
	}
	if resp.CPM <= 0 {
		t.Fatalf("expected positive cpm, got %f", resp.CPM)
	}
}

func TestMoloco_NoFillMapsToNoBid(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer ts.Close()

	ad := NewMolocoAdapter("seat", "api-key")
	req := BidRequest{RequestID: "req-mc-2", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if !resp.NoBid || resp.NoBidReason != NoBidNoFill {
		t.Fatalf("expected no_fill, got noBid=%v reason=%s", resp.NoBid, resp.NoBidReason)
	}
}

func TestMoloco_RetryThenBid(t *testing.T) {
	var calls int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&calls, 1) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"bid": map[string]any{"price": 1.0}})
	}))
	defer ts.Close()

	ad := NewMolocoAdapter("seat", "api-key")
	req := BidRequest{RequestID: "req-mc-3", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if resp.NoBid {
		t.Fatalf("expected bid after retry, got %s", resp.NoBidReason)
	}
	if atomic.LoadInt32(&calls) < 2 {
		t.Fatalf("expected retry, calls=%d", calls)
	}
}

func TestMoloco_CircuitBreakerOpens(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer ts.Close()

	ad := NewMolocoAdapter("seat", "api-key")
	req := BidRequest{RequestID: "req-mc-4", Metadata: map[string]string{"test_endpoint": ts.URL}}
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		_, _ = ad.RequestBid(ctx, req)
	}
	resp, _ := ad.RequestBid(ctx, req)
	if !resp.NoBid || resp.NoBidReason != NoBidCircuitOpen {
		t.Fatalf("expected circuit open, got %s", resp.NoBidReason)
	}
}

func TestMoloco_TimeoutMapsToNoBid(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	ad := NewMolocoAdapter("seat", "api-key")
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	req := BidRequest{RequestID: "req-mc-5", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(ctx, req)
	if !resp.NoBid || resp.NoBidReason != NoBidTimeout {
		t.Fatalf("expected timeout, got noBid=%v reason=%s", resp.NoBid, resp.NoBidReason)
	}
}
