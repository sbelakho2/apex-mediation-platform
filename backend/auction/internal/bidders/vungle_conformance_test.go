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

func TestVungle_SuccessBid(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ad": map[string]any{
				"creative_id": "cr-vg",
				"cpm":         1.4,
				"html":        "<div>ad</div>",
			},
		})
	}))
	defer ts.Close()
	ad := NewVungleAdapter("app", "key")
	req := BidRequest{RequestID: "req-vg-1", PlacementID: "pl1", AppID: "bundle", AdType: "interstitial", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, err := ad.RequestBid(context.Background(), req)
	if err != nil { t.Fatalf("unexpected err: %v", err) }
	if resp.NoBid { t.Fatalf("unexpected no-bid: %s", resp.NoBidReason) }
	if resp.CPM <= 0 { t.Fatalf("expected positive cpm, got %f", resp.CPM) }
}

func TestVungle_NoFill204(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	defer ts.Close()
	ad := NewVungleAdapter("app", "key")
	req := BidRequest{RequestID: "req-vg-2", PlacementID: "pl1", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if !resp.NoBid || resp.NoBidReason != NoBidNoFill { t.Fatalf("expected no_fill, got %v %s", resp.NoBid, resp.NoBidReason) }
}

func TestVungle_RetryThenSuccess(t *testing.T) {
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
		_ = json.NewEncoder(w).Encode(map[string]any{"ad": map[string]any{"cpm": 0.8, "creative_id": "cr"}})
	}))
	defer ts.Close()
	ad := NewVungleAdapter("app", "key")
	req := BidRequest{RequestID: "req-vg-3", PlacementID: "pl1", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if resp.NoBid { t.Fatalf("expected bid after retry, got %s", resp.NoBidReason) }
	if atomic.LoadInt32(&calls) < 2 { t.Fatalf("expected at least 2 calls, got %d", calls) }
}

func TestVungle_CircuitOpenAfterFailures(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("err"))
	}))
	defer ts.Close()
	ad := NewVungleAdapter("app", "key")
	req := BidRequest{RequestID: "req-vg-4", Metadata: map[string]string{"test_endpoint": ts.URL}}
	ctx := context.Background()
	for i := 0; i < 5; i++ { _, _ = ad.RequestBid(ctx, req) }
	resp, _ := ad.RequestBid(ctx, req)
	if !resp.NoBid || resp.NoBidReason != NoBidCircuitOpen { t.Fatalf("expected circuit_open, got %v %s", resp.NoBid, resp.NoBidReason) }
}

func TestVungle_400_NoRetry_andStatusReason(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusBadRequest) }))
	defer ts.Close()
	ad := NewVungleAdapter("app", "key")
	req := BidRequest{RequestID: "req-vg-5", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if !resp.NoBid || resp.NoBidReason != "status_400" { t.Fatalf("expected status_400, got %s", resp.NoBidReason) }
}

func TestVungle_200MalformedJSON_mapsToError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("{not-json"))
	}))
	defer ts.Close()
	ad := NewVungleAdapter("app", "key")
	req := BidRequest{RequestID: "req-vg-6", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if !resp.NoBid || (resp.NoBidReason != NoBidError && resp.NoBidReason != "error") { t.Fatalf("expected error, got %s", resp.NoBidReason) }
}

func TestVungle_302_NoRetry_andStatusReason(t *testing.T) {
	var calls int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Header().Set("Location", "http://example.com")
		w.WriteHeader(http.StatusFound)
	}))
	defer ts.Close()
	ad := NewVungleAdapter("app", "key")
	req := BidRequest{RequestID: "req-vg-302", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if !resp.NoBid || resp.NoBidReason != "status_302" { t.Fatalf("expected status_302, got %s", resp.NoBidReason) }
	if atomic.LoadInt32(&calls) != 1 { t.Fatalf("expected exactly 1 call (no retry on 3xx), got %d", calls) }
}

func TestVungle_SlowBodyTimeout_MapsToTimeout(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if f, ok := w.(http.Flusher); ok { f.Flush() }
		time.Sleep(200 * time.Millisecond)
		_, _ = w.Write([]byte(`{"ad":{"cpm":1.0}}`))
	}))
	defer ts.Close()
	ad := NewVungleAdapter("app", "key")
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	req := BidRequest{RequestID: "req-vg-slow", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(ctx, req)
	if !resp.NoBid || resp.NoBidReason != NoBidTimeout {
		t.Fatalf("expected timeout, got noBid=%v reason=%s", resp.NoBid, resp.NoBidReason)
	}
}
