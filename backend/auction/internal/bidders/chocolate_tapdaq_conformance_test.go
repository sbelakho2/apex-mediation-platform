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

func TestChocolate_SuccessBid(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ad": map[string]any{
				"creative_id": "cr-choc",
				"cpm":         1.7,
				"html":        "<div>ad</div>",
			},
		})
	}))
	defer ts.Close()
	ad := NewChocolateAdapter("app", "key")
	req := BidRequest{RequestID: "req-choc-1", PlacementID: "pl1", AppID: "bundle", AdType: "interstitial", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, err := ad.RequestBid(context.Background(), req)
	if err != nil { t.Fatalf("unexpected err: %v", err) }
	if resp.NoBid { t.Fatalf("unexpected no-bid: %s", resp.NoBidReason) }
	if resp.CPM <= 0 { t.Fatalf("expected positive cpm, got %f", resp.CPM) }
}

func TestChocolate_NoFill204(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	defer ts.Close()
	ad := NewChocolateAdapter("app", "key")
	req := BidRequest{RequestID: "req-choc-2", PlacementID: "pl1", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if !resp.NoBid || resp.NoBidReason != NoBidNoFill { t.Fatalf("expected no_fill, got %v %s", resp.NoBid, resp.NoBidReason) }
}

func TestChocolate_RetryThenSuccess(t *testing.T) {
	var calls int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c := atomic.AddInt32(&calls, 1)
		if c == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte("oops"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{"ad": map[string]any{"cpm": 0.9, "creative_id": "cr"}})
	}))
	defer ts.Close()
	ad := NewChocolateAdapter("app", "key")
	req := BidRequest{RequestID: "req-choc-3", PlacementID: "pl1", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if resp.NoBid { t.Fatalf("expected bid after retry, got %s", resp.NoBidReason) }
	if atomic.LoadInt32(&calls) < 2 { t.Fatalf("expected at least 2 calls, got %d", calls) }
}

func TestChocolate_CircuitOpenAfterFailures(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("err"))
	}))
	defer ts.Close()
	ad := NewChocolateAdapter("app", "key")
	req := BidRequest{RequestID: "req-choc-4", Metadata: map[string]string{"test_endpoint": ts.URL}}
	ctx := context.Background()
	for i := 0; i < 5; i++ { _, _ = ad.RequestBid(ctx, req) }
	// Next call should fast-fail circuit
	resp, _ := ad.RequestBid(ctx, req)
	if !resp.NoBid || resp.NoBidReason != NoBidCircuitOpen { t.Fatalf("expected circuit_open, got %v %s", resp.NoBid, resp.NoBidReason) }
}

func TestChocolate_400_NoRetry_andStatusReason(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusBadRequest) }))
	defer ts.Close()
	ad := NewChocolateAdapter("app", "key")
	req := BidRequest{RequestID: "req-choc-5", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if !resp.NoBid || resp.NoBidReason != "status_400" { t.Fatalf("expected status_400, got %s", resp.NoBidReason) }
}

func TestChocolate_200MalformedJSON_mapsToError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("{not-json"))
	}))
	defer ts.Close()
	ad := NewChocolateAdapter("app", "key")
	req := BidRequest{RequestID: "req-choc-6", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if !resp.NoBid || resp.NoBidReason != NoBidError { t.Fatalf("expected error, got %s", resp.NoBidReason) }
}

// ---- Tapdaq tests ----

func TestTapdaq_SuccessBid(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ad": map[string]any{
				"creative_id": "cr-td",
				"cpm":         1.3,
				"ad_markup":   "<div>ad</div>",
			},
		})
	}))
	defer ts.Close()
	ad := NewTapdaqAdapter("app", "key")
	req := BidRequest{RequestID: "req-td-1", PlacementID: "pl1", AppID: "bundle", AdType: "interstitial", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, err := ad.RequestBid(context.Background(), req)
	if err != nil { t.Fatalf("unexpected err: %v", err) }
	if resp.NoBid { t.Fatalf("unexpected no-bid: %s", resp.NoBidReason) }
	if resp.CPM <= 0 { t.Fatalf("expected positive cpm, got %f", resp.CPM) }
}

func TestTapdaq_NoFill204(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	defer ts.Close()
	ad := NewTapdaqAdapter("app", "key")
	req := BidRequest{RequestID: "req-td-2", PlacementID: "pl1", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if !resp.NoBid || resp.NoBidReason != NoBidNoFill { t.Fatalf("expected no_fill, got %v %s", resp.NoBid, resp.NoBidReason) }
}

func TestTapdaq_RetryThenSuccess(t *testing.T) {
	var calls int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c := atomic.AddInt32(&calls, 1)
		if c == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte("oops"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{"ad": map[string]any{"cpm": 0.6, "creative_id": "cr"}})
	}))
	defer ts.Close()
	ad := NewTapdaqAdapter("app", "key")
	req := BidRequest{RequestID: "req-td-3", PlacementID: "pl1", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if resp.NoBid { t.Fatalf("expected bid after retry, got %s", resp.NoBidReason) }
	if atomic.LoadInt32(&calls) < 2 { t.Fatalf("expected at least 2 calls, got %d", calls) }
}

func TestTapdaq_CircuitOpenAfterFailures(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("err"))
	}))
	defer ts.Close()
	ad := NewTapdaqAdapter("app", "key")
	req := BidRequest{RequestID: "req-td-4", Metadata: map[string]string{"test_endpoint": ts.URL}}
	ctx := context.Background()
	for i := 0; i < 5; i++ { _, _ = ad.RequestBid(ctx, req) }
	resp, _ := ad.RequestBid(ctx, req)
	if !resp.NoBid || resp.NoBidReason != NoBidCircuitOpen { t.Fatalf("expected circuit_open, got %v %s", resp.NoBid, resp.NoBidReason) }
}

func TestTapdaq_400_NoRetry_andStatusReason(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusBadRequest) }))
	defer ts.Close()
	ad := NewTapdaqAdapter("app", "key")
	req := BidRequest{RequestID: "req-td-5", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if !resp.NoBid || resp.NoBidReason != "status_400" { t.Fatalf("expected status_400, got %s", resp.NoBidReason) }
}

func TestTapdaq_200MalformedJSON_mapsToError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("{not-json"))
	}))
	defer ts.Close()
	ad := NewTapdaqAdapter("app", "key")
	req := BidRequest{RequestID: "req-td-6", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if !resp.NoBid || resp.NoBidReason != NoBidError { t.Fatalf("expected error, got %s", resp.NoBidReason) }
}
