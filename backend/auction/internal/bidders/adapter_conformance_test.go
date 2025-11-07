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

func TestAppLovin_SuccessBid(t *testing.T) {
	// Arrange
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ad": map[string]any{
				"ad_id":      "ad-123",
				"creative_id": "cr-9",
				"revenue":    1.23, // dollars; adapter multiplies by 1000
				"html":       "<div>ad</div>",
				"network":    "xyz",
			},
		})
	}))
	defer ts.Close()

	adapter := NewAppLovinAdapter("sdk-abc")
	req := BidRequest{
		RequestID: "req-1",
		AppID:     "com.example.app",
		AdType:    "interstitial",
		DeviceInfo: DeviceInfo{OS: "android", OSVersion: "14", Model: "Pixel"},
		UserInfo:   UserInfo{AdvertisingID: "gaid-1"},
		Metadata: map[string]string{
			"applovin_ad_unit_id": "unit-1",
			"test_endpoint":       ts.URL,
		},
	}

	// Act
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Assert
	if resp.NoBid {
		t.Fatalf("expected bid, got no-bid: %v", resp.NoBidReason)
	}
	if resp.CPM <= 0 {
		t.Fatalf("expected positive CPM, got %f", resp.CPM)
	}
}

func TestAppLovin_NoFill204(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer ts.Close()

	adapter := NewAppLovinAdapter("sdk-abc")
	req := BidRequest{RequestID: "req-2", Metadata: map[string]string{"applovin_ad_unit_id": "unit-1", "test_endpoint": ts.URL}}
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.NoBid || resp.NoBidReason != NoBidNoFill {
		t.Fatalf("expected no_fill, got: noBid=%v reason=%s", resp.NoBid, resp.NoBidReason)
	}
}

func TestAppLovin_RetryThenSuccess(t *testing.T) {
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
		_ = json.NewEncoder(w).Encode(map[string]any{"ad": map[string]any{"ad_id": "ok", "revenue": 0.5, "html": "<x>"}})
	}))
	defer ts.Close()

	adapter := NewAppLovinAdapter("sdk-abc")
	req := BidRequest{RequestID: "req-3", Metadata: map[string]string{"applovin_ad_unit_id": "unit-1", "test_endpoint": ts.URL}}
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.NoBid {
		t.Fatalf("expected bid after retry, got no-bid: %s", resp.NoBidReason)
	}
	if atomic.LoadInt32(&calls) < 2 {
		t.Fatalf("expected at least 2 calls due to retry, got %d", calls)
	}
}

func TestAppLovin_CircuitOpenAfterFailures(t *testing.T) {
	// Always 500
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("err"))
	}))
	defer ts.Close()

	adapter := NewAppLovinAdapter("sdk-abc")
	req := BidRequest{RequestID: "req-4", Metadata: map[string]string{"applovin_ad_unit_id": "unit-1", "test_endpoint": ts.URL}}

	// Trigger 3 failures to open circuit (adapter policy)
	for i := 0; i < 3; i++ {
		resp, err := adapter.RequestBid(context.Background(), req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !resp.NoBid {
			t.Fatalf("expected no-bid on failure attempt %d", i+1)
		}
	}

	// Next call should fail fast with circuit_open
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.NoBid || resp.NoBidReason != NoBidCircuitOpen {
		t.Fatalf("expected circuit_open, got noBid=%v reason=%s", resp.NoBid, resp.NoBidReason)
	}
}

func TestIronSource_SuccessBid(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"providerName": "iron",
			"revenue":      2.0,
			"auctionId":    "auc-1",
			"creativeId":   "cr-1",
			"adMarkup":     "<vast/>",
			"instanceId":   "inst-1",
		})
	}))
	defer ts.Close()

	adapter := NewIronSourceAdapter("appk", "seck")
	req := BidRequest{
		RequestID: "req-5",
		AppID:     "com.example",
		AdType:    "interstitial",
		DeviceInfo: DeviceInfo{OS: "ios", OSVersion: "17.1", Model: "iPhone"},
		UserInfo:   UserInfo{AdvertisingID: "idfa-1"},
		Metadata:   map[string]string{"ironsource_instance_id": "i-1", "test_endpoint": ts.URL},
	}
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.NoBid {
		t.Fatalf("expected bid, got no-bid: %s", resp.NoBidReason)
	}
}

func TestIronSource_NoFill204(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer ts.Close()
	adapter := NewIronSourceAdapter("appk", "seck")
	req := BidRequest{RequestID: "req-6", Metadata: map[string]string{"ironsource_instance_id": "i-1", "test_endpoint": ts.URL}}
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.NoBid || resp.NoBidReason != NoBidNoFill {
		t.Fatalf("expected no_fill, got %v/%s", resp.NoBid, resp.NoBidReason)
	}
}

func TestIronSource_RetryThenSuccess(t *testing.T) {
	var calls int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c := atomic.AddInt32(&calls, 1)
		if c == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte("err"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{"providerName": "iron", "revenue": 1.1, "auctionId": "a2"})
	}))
	defer ts.Close()

	adapter := NewIronSourceAdapter("appk", "seck")
	req := BidRequest{RequestID: "req-7", Metadata: map[string]string{"ironsource_instance_id": "i-1", "test_endpoint": ts.URL}}
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.NoBid {
		t.Fatalf("expected bid after retry, got no-bid: %s", resp.NoBidReason)
	}
	if atomic.LoadInt32(&calls) < 2 {
		t.Fatalf("expected at least 2 calls due to retry, got %d", calls)
	}
}

func TestIronSource_CircuitOpenAfterFailures(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("err"))
	}))
	defer ts.Close()

	adapter := NewIronSourceAdapter("appk", "seck")
	req := BidRequest{RequestID: "req-8", Metadata: map[string]string{"ironsource_instance_id": "i-1", "test_endpoint": ts.URL}}

	for i := 0; i < 3; i++ {
		resp, err := adapter.RequestBid(context.Background(), req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !resp.NoBid {
			t.Fatalf("expected no-bid on failure attempt %d", i+1)
		}
	}

	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.NoBid || resp.NoBidReason != NoBidCircuitOpen {
		t.Fatalf("expected circuit_open, got %v/%s", resp.NoBid, resp.NoBidReason)
	}
}

// Ensure tests don't hang due to default 5s client timeouts; use context deadlines if needed
func withTimeout(ctx context.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, d)
}


func TestAdMob_SuccessBid(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":       "resp-1",
			"seatbid": []any{map[string]any{"bid": []any{map[string]any{
				"id":     "b1",
				"impid":  "imp-1",
				"price":  1.1,
				"adid":   "ad-1",
				"adm":    "<html>ad</html>",
				"w":      320,
				"h":      50,
			}}}},
			"bidid": "bid-1",
			"cur":   "USD",
		})
	}))
	defer ts.Close()

	adapter := NewAdMobAdapter("api-key", "pub-1")
	req := BidRequest{
		RequestID: "req-am-1",
		AppID:     "com.example.app",
		AdType:    "banner",
		DeviceInfo: DeviceInfo{OS: "android", OSVersion: "14", Model: "Pixel", ScreenWidth: 320, ScreenHeight: 50, UserAgent: "UA", IP: "1.1.1.1", Language: "en", ConnectionType: "wifi"},
		UserInfo:   UserInfo{AdvertisingID: "gaid-1"},
		Metadata: map[string]string{
			"admob_app_id":     "app-1",
			"admob_ad_unit_id": "unit-1",
			"test_endpoint":     ts.URL,
		},
	}
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.NoBid {
		t.Fatalf("expected bid, got no-bid: %s", resp.NoBidReason)
	}
	if resp.CPM <= 0 {
		t.Fatalf("expected positive CPM, got %f", resp.CPM)
	}
}

func TestAdMob_NoFill204(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer ts.Close()
	adapter := NewAdMobAdapter("api-key", "pub-1")
	req := BidRequest{RequestID: "req-am-2", Metadata: map[string]string{"admob_app_id": "app-1", "admob_ad_unit_id": "unit-1", "test_endpoint": ts.URL}}
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.NoBid || resp.NoBidReason != NoBidNoFill {
		t.Fatalf("expected no_fill, got %v/%s", resp.NoBid, resp.NoBidReason)
	}
}

func TestAdMob_RetryThenSuccess(t *testing.T) {
	var calls int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c := atomic.AddInt32(&calls, 1)
		if c == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte("err"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":       "resp-2",
			"seatbid": []any{map[string]any{"bid": []any{map[string]any{"id": "b2", "impid": "i", "price": 0.9, "adid": "a2", "adm": "<x>", "w": 300, "h": 250}}}},
			"bidid":    "bid-2",
			"cur":      "USD",
		})
	}))
	defer ts.Close()
	adapter := NewAdMobAdapter("api-key", "pub-1")
	req := BidRequest{RequestID: "req-am-3", Metadata: map[string]string{"admob_app_id": "app-1", "admob_ad_unit_id": "unit-1", "test_endpoint": ts.URL}}
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.NoBid {
		t.Fatalf("expected bid after retry, got %s", resp.NoBidReason)
	}
	if atomic.LoadInt32(&calls) < 2 {
		t.Fatalf("expected at least 2 calls due to retry, got %d", calls)
	}
}

func TestAdMob_CircuitOpenAfterFailures(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("err"))
	}))
	defer ts.Close()
	adapter := NewAdMobAdapter("api-key", "pub-1")
	req := BidRequest{RequestID: "req-am-4", Metadata: map[string]string{"admob_app_id": "app-1", "admob_ad_unit_id": "unit-1", "test_endpoint": ts.URL}}
	for i := 0; i < 3; i++ {
		_, _ = adapter.RequestBid(context.Background(), req)
	}
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.NoBid || resp.NoBidReason != NoBidCircuitOpen {
		t.Fatalf("expected circuit_open, got %v/%s", resp.NoBid, resp.NoBidReason)
	}
}

func TestMeta_SuccessBid(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success":       true,
			"placement_id":  "pl-1",
			"bid_id":        "bid-9",
			"bid_price":     2.2,
			"currency":      "USD",
			"creative_id":   "cr-9",
			"ad_markup":     "<ad/>",
			"width":         320,
			"height":        50,
			"campaign_id":   "cmp-1",
			"impression_url": "https://imp",
			"click_url":     "https://clk",
		})
	}))
	defer ts.Close()
	adapter := NewMetaAdapter("app", "secret")
	req := BidRequest{RequestID: "req-m-1", AppID: "com.example.app", AdType: "banner", FloorCPM: 0.5, DeviceInfo: DeviceInfo{OS: "android", OSVersion: "14", Model: "Pixel", UserAgent: "UA", IP: "1.1.1.1", Language: "en", ScreenWidth: 320, ScreenHeight: 50, ConnectionType: "wifi"}, UserInfo: UserInfo{AdvertisingID: "gaid"}, Metadata: map[string]string{"meta_placement_id": "pl-1", "test_endpoint": ts.URL}}
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.NoBid {
		t.Fatalf("expected bid, got no-bid: %s", resp.NoBidReason)
	}
}

func TestMeta_NoFill204(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer ts.Close()
	adapter := NewMetaAdapter("app", "secret")
	req := BidRequest{RequestID: "req-m-2", Metadata: map[string]string{"meta_placement_id": "pl-1", "test_endpoint": ts.URL}}
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.NoBid || resp.NoBidReason != NoBidNoFill {
		t.Fatalf("expected no_fill, got %v/%s", resp.NoBid, resp.NoBidReason)
	}
}

func TestMeta_RetryThenSuccess(t *testing.T) {
	var calls int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c := atomic.AddInt32(&calls, 1)
		if c == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte("err"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "placement_id": "pl-1", "bid_id": "b1", "bid_price": 0.7})
	}))
	defer ts.Close()
	adapter := NewMetaAdapter("app", "secret")
	req := BidRequest{RequestID: "req-m-3", Metadata: map[string]string{"meta_placement_id": "pl-1", "test_endpoint": ts.URL}}
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.NoBid {
		t.Fatalf("expected bid after retry, got %s", resp.NoBidReason)
	}
	if atomic.LoadInt32(&calls) < 2 {
		t.Fatalf("expected at least 2 calls due to retry, got %d", calls)
	}
}

func TestMeta_CircuitOpenAfterFailures(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("err"))
	}))
	defer ts.Close()
	adapter := NewMetaAdapter("app", "secret")
	req := BidRequest{RequestID: "req-m-4", Metadata: map[string]string{"meta_placement_id": "pl-1", "test_endpoint": ts.URL}}
	for i := 0; i < 3; i++ {
		_, _ = adapter.RequestBid(context.Background(), req)
	}
	resp, err := adapter.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.NoBid || resp.NoBidReason != NoBidCircuitOpen {
		t.Fatalf("expected circuit_open, got %v/%s", resp.NoBid, resp.NoBidReason)
	}
}


// Unity adapter offline conformance tests
func TestUnity_SuccessBid(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"fills": []any{map[string]any{
				"fillId":     "f-1",
				"campaignId": "c-1",
				"bidPrice":   1.25,
				"adMarkup":   "<div>uad</div>",
			}},
		})
	}))
	defer ts.Close()

	a := NewUnityAdapter("game-1", "key-1")
	req := BidRequest{
		RequestID: "req-u-1",
		AdType:    "interstitial",
		DeviceInfo: DeviceInfo{OS: "android", OSVersion: "14", Make: "google", Model: "Pixel"},
		UserInfo:   UserInfo{AdvertisingID: "gaid-1"},
		Metadata: map[string]string{
			"unity_placement_id": "pl-1",
			"test_endpoint":      ts.URL,
		},
	}
	resp, err := a.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.NoBid {
		t.Fatalf("expected bid, got no-bid: %s", resp.NoBidReason)
	}
	if resp.CPM <= 0 {
		t.Fatalf("expected positive CPM, got %f", resp.CPM)
	}
}

func TestUnity_NoFill204(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer ts.Close()
	a := NewUnityAdapter("game-1", "key-1")
	req := BidRequest{RequestID: "req-u-2", Metadata: map[string]string{"unity_placement_id": "pl-1", "test_endpoint": ts.URL}}
	resp, err := a.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.NoBid || resp.NoBidReason != NoBidNoFill {
		t.Fatalf("expected no_fill, got %v/%s", resp.NoBid, resp.NoBidReason)
	}
}

func TestUnity_RetryThenSuccess(t *testing.T) {
	var calls int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c := atomic.AddInt32(&calls, 1)
		if c == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte("err"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{"fills": []any{map[string]any{"fillId": "f2", "campaignId": "c2", "bidPrice": 0.8, "adMarkup": "<x>"}}})
	}))
	defer ts.Close()
	a := NewUnityAdapter("game-1", "key-1")
	req := BidRequest{RequestID: "req-u-3", Metadata: map[string]string{"unity_placement_id": "pl-1", "test_endpoint": ts.URL}}
	resp, err := a.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.NoBid {
		t.Fatalf("expected bid after retry, got %s", resp.NoBidReason)
	}
	if atomic.LoadInt32(&calls) < 2 {
		t.Fatalf("expected at least 2 calls due to retry, got %d", calls)
	}
}

func TestUnity_CircuitOpenAfterFailures(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("err"))
	}))
	defer ts.Close()
	a := NewUnityAdapter("game-1", "key-1")
	req := BidRequest{RequestID: "req-u-4", Metadata: map[string]string{"unity_placement_id": "pl-1", "test_endpoint": ts.URL}}
	for i := 0; i < 3; i++ {
		_, _ = a.RequestBid(context.Background(), req)
	}
	resp, err := a.RequestBid(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.NoBid || resp.NoBidReason != NoBidCircuitOpen {
		t.Fatalf("expected circuit_open, got %v/%s", resp.NoBid, resp.NoBidReason)
	}
}


// --- Edge case tests: non-transient 4xx and malformed JSON for AdMob & Meta ---

func TestAdMob_Status400_NoRetry_NoBid(t *testing.T) {
    // Arrange: server always returns 400
    var calls int32
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        atomic.AddInt32(&calls, 1)
        w.WriteHeader(http.StatusBadRequest)
        _, _ = w.Write([]byte("bad request"))
    }))
    defer ts.Close()

    adapter := NewAdMobAdapter("app-123", "api-xyz")
    req := BidRequest{
        RequestID:  "req-admob-400",
        PlacementID: "pl-1",
        Metadata:   map[string]string{"admob_ad_unit_id": "unit-1", "test_endpoint": ts.URL},
    }

    // Act
    resp, err := adapter.RequestBid(context.Background(), req)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }

    // Assert: NoBid with status_400 and no retry beyond the single attempt
    if !resp.NoBid {
        t.Fatalf("expected no-bid for 400 response")
    }
    if resp.NoBidReason != "status_400" && resp.NoBidReason != NoBidError {
        t.Fatalf("expected reason status_400 or error, got %q", resp.NoBidReason)
    }
    if c := atomic.LoadInt32(&calls); c != 1 {
        t.Fatalf("expected no retry on 4xx, calls=%d", c)
    }
}

func TestAdMob_MalformedJSON_NoBidError(t *testing.T) {
    // Arrange: 200 OK but body is not valid JSON
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte("{not-json"))
    }))
    defer ts.Close()

    adapter := NewAdMobAdapter("app-123", "api-xyz")
    req := BidRequest{RequestID: "req-admob-badjson", Metadata: map[string]string{"admob_ad_unit_id": "unit-1", "test_endpoint": ts.URL}}

    // Act
    resp, err := adapter.RequestBid(context.Background(), req)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }

    // Assert
    if !resp.NoBid {
        t.Fatalf("expected no-bid for malformed JSON")
    }
    if resp.NoBidReason != NoBidError && resp.NoBidReason != "error" {
        t.Fatalf("expected standardized 'error' reason, got %q", resp.NoBidReason)
    }
}

func TestMeta_Status400_NoRetry_NoBid(t *testing.T) {
    // Arrange: server returns 400
    var calls int32
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        atomic.AddInt32(&calls, 1)
        w.WriteHeader(http.StatusBadRequest)
        _, _ = w.Write([]byte("bad request"))
    }))
    defer ts.Close()

    adapter := NewMetaAdapter("token-abc")
    req := BidRequest{RequestID: "req-meta-400", Metadata: map[string]string{"meta_placement_id": "pl-1", "test_endpoint": ts.URL}}

    // Act
    resp, err := adapter.RequestBid(context.Background(), req)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }

    // Assert
    if !resp.NoBid {
        t.Fatalf("expected no-bid for 400 response")
    }
    if resp.NoBidReason != "status_400" && resp.NoBidReason != NoBidError {
        t.Fatalf("expected reason status_400 or error, got %q", resp.NoBidReason)
    }
    if c := atomic.LoadInt32(&calls); c != 1 {
        t.Fatalf("expected no retry on 4xx, calls=%d", c)
    }
}

func TestMeta_MalformedJSON_NoBidError(t *testing.T) {
    // Arrange: 200 OK but body is not valid JSON
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte("<html>not json</html>"))
    }))
    defer ts.Close()

    adapter := NewMetaAdapter("token-abc")
    req := BidRequest{RequestID: "req-meta-badjson", Metadata: map[string]string{"meta_placement_id": "pl-1", "test_endpoint": ts.URL}}

    // Act
    resp, err := adapter.RequestBid(context.Background(), req)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }

    // Assert
    if !resp.NoBid {
        t.Fatalf("expected no-bid for malformed JSON")
    }
    if resp.NoBidReason != NoBidError && resp.NoBidReason != "error" {
        t.Fatalf("expected standardized 'error' reason, got %q", resp.NoBidReason)
    }
}


// --- Additional Edge case tests: non-transient 4xx and malformed JSON for Unity, AppLovin, ironSource ---

func TestUnity_Status400_NoRetry_NoBid(t *testing.T) {
    var calls int32
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        atomic.AddInt32(&calls, 1)
        w.WriteHeader(http.StatusBadRequest)
        _, _ = w.Write([]byte("bad request"))
    }))
    defer ts.Close()

    a := NewUnityAdapter("game-1", "key-1")
    req := BidRequest{RequestID: "req-unity-400", Metadata: map[string]string{"unity_placement_id": "pl-1", "test_endpoint": ts.URL}}

    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid { t.Fatalf("expected no-bid for 400 response") }
    if resp.NoBidReason != "status_400" && resp.NoBidReason != NoBidError {
        t.Fatalf("expected reason status_400 or error, got %q", resp.NoBidReason)
    }
    if c := atomic.LoadInt32(&calls); c != 1 {
        t.Fatalf("expected no retry on 4xx, calls=%d", c)
    }
}

func TestUnity_MalformedJSON_NoBidError(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte("{not-json"))
    }))
    defer ts.Close()

    a := NewUnityAdapter("game-1", "key-1")
    req := BidRequest{RequestID: "req-unity-badjson", Metadata: map[string]string{"unity_placement_id": "pl-1", "test_endpoint": ts.URL}}

    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid { t.Fatalf("expected no-bid for malformed JSON") }
    if resp.NoBidReason != NoBidError && resp.NoBidReason != "error" {
        t.Fatalf("expected standardized 'error' reason, got %q", resp.NoBidReason)
    }
}

func TestAppLovin_Status400_NoRetry_NoBid(t *testing.T) {
    var calls int32
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        atomic.AddInt32(&calls, 1)
        w.WriteHeader(http.StatusBadRequest)
        _, _ = w.Write([]byte("bad request"))
    }))
    defer ts.Close()

    adapter := NewAppLovinAdapter("sdk-abc")
    req := BidRequest{RequestID: "req-applovin-400", Metadata: map[string]string{"applovin_ad_unit_id": "unit-1", "test_endpoint": ts.URL}}

    resp, err := adapter.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid { t.Fatalf("expected no-bid for 400 response") }
    if resp.NoBidReason != "status_400" && resp.NoBidReason != NoBidError {
        t.Fatalf("expected reason status_400 or error, got %q", resp.NoBidReason)
    }
    if c := atomic.LoadInt32(&calls); c != 1 {
        t.Fatalf("expected no retry on 4xx, calls=%d", c)
    }
}

func TestAppLovin_MalformedJSON_NoBidError(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte("<xml>not json</xml>"))
    }))
    defer ts.Close()

    adapter := NewAppLovinAdapter("sdk-abc")
    req := BidRequest{RequestID: "req-applovin-badjson", Metadata: map[string]string{"applovin_ad_unit_id": "unit-1", "test_endpoint": ts.URL}}

    resp, err := adapter.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid { t.Fatalf("expected no-bid for malformed JSON") }
    if resp.NoBidReason != NoBidError && resp.NoBidReason != "error" {
        t.Fatalf("expected standardized 'error' reason, got %q", resp.NoBidReason)
    }
}

func TestIronSource_Status400_NoRetry_NoBid(t *testing.T) {
    var calls int32
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        atomic.AddInt32(&calls, 1)
        w.WriteHeader(http.StatusBadRequest)
        _, _ = w.Write([]byte("bad request"))
    }))
    defer ts.Close()

    adapter := NewIronSourceAdapter("appk", "seck")
    req := BidRequest{RequestID: "req-ironsource-400", Metadata: map[string]string{"ironsource_instance_id": "i-1", "test_endpoint": ts.URL}}

    resp, err := adapter.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid { t.Fatalf("expected no-bid for 400 response") }
    if resp.NoBidReason != "status_400" && resp.NoBidReason != NoBidError {
        t.Fatalf("expected reason status_400 or error, got %q", resp.NoBidReason)
    }
    if c := atomic.LoadInt32(&calls); c != 1 {
        t.Fatalf("expected no retry on 4xx, calls=%d", c)
    }
}

func TestIronSource_MalformedJSON_NoBidError(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte("not-json"))
    }))
    defer ts.Close()

    adapter := NewIronSourceAdapter("appk", "seck")
    req := BidRequest{RequestID: "req-ironsource-badjson", Metadata: map[string]string{"ironsource_instance_id": "i-1", "test_endpoint": ts.URL}}

    resp, err := adapter.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid { t.Fatalf("expected no-bid for malformed JSON") }
    if resp.NoBidReason != NoBidError && resp.NoBidReason != "error" {
        t.Fatalf("expected standardized 'error' reason, got %q", resp.NoBidReason)
    }
}


// --- Fyber (FairBid) offline conformance tests ---

func TestFyber_SuccessBid(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        _ = json.NewEncoder(w).Encode(map[string]any{
            "ad": map[string]any{
                "creative_id": "cr-1",
                "html": "<div>ad</div>",
                "cpm": 1.1,
            },
            "cpm": 1.1,
        })
    }))
    defer ts.Close()

    a := NewFyberAdapter("app-1", "api-1")
    req := BidRequest{RequestID: "req-fyber-1", PlacementID: "pl-1", AdType: "interstitial", AppID: "com.example.app", DeviceInfo: DeviceInfo{OS: "android", OSVersion: "14", Model: "Pixel"}, UserInfo: UserInfo{AdvertisingID: "gaid"}, Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if resp.NoBid { t.Fatalf("expected bid, got no-bid: %s", resp.NoBidReason) }
    if resp.CPM <= 0 { t.Fatalf("expected positive cpm") }
}

func TestFyber_NoFill204(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }))
    defer ts.Close()
    a := NewFyberAdapter("app-1", "api-1")
    req := BidRequest{RequestID: "req-fyber-2", Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected err: %v", err) }
    if !resp.NoBid || resp.NoBidReason != NoBidNoFill { t.Fatalf("expected no_fill, got %v/%s", resp.NoBid, resp.NoBidReason) }
}

func TestFyber_RetryThenSuccess(t *testing.T) {
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
        _ = json.NewEncoder(w).Encode(map[string]any{"ad": map[string]any{"cpm": 0.9, "html": "<x>"}})
    }))
    defer ts.Close()

    a := NewFyberAdapter("app-1", "api-1")
    req := BidRequest{RequestID: "req-fyber-3", Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if resp.NoBid { t.Fatalf("expected bid after retry, got %s", resp.NoBidReason) }
    if atomic.LoadInt32(&calls) < 2 { t.Fatalf("expected at least 2 calls, got %d", calls) }
}

func TestFyber_CircuitOpenAfterFailures(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusInternalServerError)
        _, _ = w.Write([]byte("err"))
    }))
    defer ts.Close()

    a := NewFyberAdapter("app-1", "api-1")
    req := BidRequest{RequestID: "req-fyber-4", Metadata: map[string]string{"test_endpoint": ts.URL}}
    // Trip the breaker by calling 3 times
    for i := 0; i < 3; i++ { _, _ = a.RequestBid(context.Background(), req) }
    // Next call should be fast-fail circuit_open
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid || resp.NoBidReason != NoBidCircuitOpen {
        t.Fatalf("expected circuit_open, got %v/%s", resp.NoBid, resp.NoBidReason)
    }
}

func TestFyber_Status400_NoRetry_NoBid(t *testing.T) {
    var calls int32
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        atomic.AddInt32(&calls, 1)
        w.WriteHeader(http.StatusBadRequest)
        _, _ = w.Write([]byte("bad"))
    }))
    defer ts.Close()
    a := NewFyberAdapter("app-1", "api-1")
    req := BidRequest{RequestID: "req-fyber-5", Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid || (resp.NoBidReason != "status_400" && resp.NoBidReason != NoBidError) { t.Fatalf("expected status_400 or error, got %s", resp.NoBidReason) }
    if c := atomic.LoadInt32(&calls); c != 1 { t.Fatalf("expected no retry on 4xx, calls=%d", c) }
}

func TestFyber_MalformedJSON_NoBidError(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte("{not-json"))
    }))
    defer ts.Close()
    a := NewFyberAdapter("app-1", "api-1")
    req := BidRequest{RequestID: "req-fyber-6", Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid || (resp.NoBidReason != NoBidError && resp.NoBidReason != "error") {
        t.Fatalf("expected standardized 'error', got %s", resp.NoBidReason)
    }
}


// --- Appodeal offline conformance tests ---

func TestAppodeal_SuccessBid(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        _ = json.NewEncoder(w).Encode(map[string]any{
            "ad": map[string]any{
                "creative_id": "ap-cr-1",
                "html": "<div>ad</div>",
                "cpm": 1.2,
            },
            "cpm": 1.2,
        })
    }))
    defer ts.Close()

    a := NewAppodealAdapter("key-1")
    req := BidRequest{RequestID: "req-appodeal-1", PlacementID: "pl-1", AdType: "interstitial", AppID: "com.example.app", DeviceInfo: DeviceInfo{OS: "android", OSVersion: "14", Model: "Pixel"}, UserInfo: UserInfo{AdvertisingID: "gaid"}, Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if resp.NoBid { t.Fatalf("expected bid, got no-bid: %s", resp.NoBidReason) }
    if resp.CPM <= 0 { t.Fatalf("expected positive cpm") }
}

func TestAppodeal_NoFill204(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }))
    defer ts.Close()
    a := NewAppodealAdapter("key-1")
    req := BidRequest{RequestID: "req-appodeal-2", Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected err: %v", err) }
    if !resp.NoBid || resp.NoBidReason != NoBidNoFill { t.Fatalf("expected no_fill, got %v/%s", resp.NoBid, resp.NoBidReason) }
}

func TestAppodeal_RetryThenSuccess(t *testing.T) {
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
        _ = json.NewEncoder(w).Encode(map[string]any{"ad": map[string]any{"cpm": 0.95, "html": "<x>"}})
    }))
    defer ts.Close()

    a := NewAppodealAdapter("key-1")
    req := BidRequest{RequestID: "req-appodeal-3", Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if resp.NoBid { t.Fatalf("expected bid after retry, got %s", resp.NoBidReason) }
    if atomic.LoadInt32(&calls) < 2 { t.Fatalf("expected at least 2 calls, got %d", calls) }
}

func TestAppodeal_CircuitOpenAfterFailures(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusInternalServerError)
        _, _ = w.Write([]byte("err"))
    }))
    defer ts.Close()

    a := NewAppodealAdapter("key-1")
    req := BidRequest{RequestID: "req-appodeal-4", Metadata: map[string]string{"test_endpoint": ts.URL}}
    // Trip the breaker by calling 3 times
    for i := 0; i < 3; i++ { _, _ = a.RequestBid(context.Background(), req) }
    // Next call should be fast-fail circuit_open
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid || resp.NoBidReason != NoBidCircuitOpen {
        t.Fatalf("expected circuit_open, got %v/%s", resp.NoBid, resp.NoBidReason)
    }
}

func TestAppodeal_Status400_NoRetry_NoBid(t *testing.T) {
    var calls int32
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        atomic.AddInt32(&calls, 1)
        w.WriteHeader(http.StatusBadRequest)
        _, _ = w.Write([]byte("bad"))
    }))
    defer ts.Close()
    a := NewAppodealAdapter("key-1")
    req := BidRequest{RequestID: "req-appodeal-5", Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid || (resp.NoBidReason != "status_400" && resp.NoBidReason != NoBidError) { t.Fatalf("expected status_400 or error, got %s", resp.NoBidReason) }
    if c := atomic.LoadInt32(&calls); c != 1 { t.Fatalf("expected no retry on 4xx, calls=%d", c) }
}

func TestAppodeal_MalformedJSON_NoBidError(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte("{not-json"))
    }))
    defer ts.Close()
    a := NewAppodealAdapter("key-1")
    req := BidRequest{RequestID: "req-appodeal-6", Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid || (resp.NoBidReason != NoBidError && resp.NoBidReason != "error") {
        t.Fatalf("expected standardized 'error', got %s", resp.NoBidReason)
    }
}


// --- Admost offline conformance tests ---

func TestAdmost_SuccessBid(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        _ = json.NewEncoder(w).Encode(map[string]any{
            "ad": map[string]any{
                "creative_id": "am-cr-1",
                "html": "<div>ad</div>",
                "cpm": 1.05,
            },
            "cpm": 1.05,
        })
    }))
    defer ts.Close()

    a := NewAdmostAdapter("app-1", "api-1")
    req := BidRequest{RequestID: "req-admost-1", PlacementID: "pl-1", AdType: "interstitial", AppID: "com.example.app", DeviceInfo: DeviceInfo{OS: "android", OSVersion: "14", Model: "Pixel"}, UserInfo: UserInfo{AdvertisingID: "gaid"}, Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if resp.NoBid { t.Fatalf("expected bid, got no-bid: %s", resp.NoBidReason) }
    if resp.CPM <= 0 { t.Fatalf("expected positive cpm") }
}

func TestAdmost_NoFill204(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }))
    defer ts.Close()
    a := NewAdmostAdapter("app-1", "api-1")
    req := BidRequest{RequestID: "req-admost-2", Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected err: %v", err) }
    if !resp.NoBid || resp.NoBidReason != NoBidNoFill { t.Fatalf("expected no_fill, got %v/%s", resp.NoBid, resp.NoBidReason) }
}

func TestAdmost_RetryThenSuccess(t *testing.T) {
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
        _ = json.NewEncoder(w).Encode(map[string]any{"ad": map[string]any{"cpm": 0.9, "html": "<x>"}})
    }))
    defer ts.Close()

    a := NewAdmostAdapter("app-1", "api-1")
    req := BidRequest{RequestID: "req-admost-3", Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if resp.NoBid { t.Fatalf("expected bid after retry, got %s", resp.NoBidReason) }
    if atomic.LoadInt32(&calls) < 2 { t.Fatalf("expected at least 2 calls, got %d", calls) }
}

func TestAdmost_CircuitOpenAfterFailures(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusInternalServerError)
        _, _ = w.Write([]byte("err"))
    }))
    defer ts.Close()
    a := NewAdmostAdapter("app-1", "api-1")
    req := BidRequest{RequestID: "req-admost-4", Metadata: map[string]string{"test_endpoint": ts.URL}}
    for i := 0; i < 3; i++ { _, _ = a.RequestBid(context.Background(), req) }
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid || resp.NoBidReason != NoBidCircuitOpen { t.Fatalf("expected circuit_open, got %v/%s", resp.NoBid, resp.NoBidReason) }
}

func TestAdmost_Status400_NoRetry_NoBid(t *testing.T) {
    var calls int32
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        atomic.AddInt32(&calls, 1)
        w.WriteHeader(http.StatusBadRequest)
        _, _ = w.Write([]byte("bad"))
    }))
    defer ts.Close()
    a := NewAdmostAdapter("app-1", "api-1")
    req := BidRequest{RequestID: "req-admost-5", Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid || (resp.NoBidReason != "status_400" && resp.NoBidReason != NoBidError) { t.Fatalf("expected status_400 or error, got %s", resp.NoBidReason) }
    if c := atomic.LoadInt32(&calls); c != 1 { t.Fatalf("expected no retry on 4xx, calls=%d", c) }
}

func TestAdmost_MalformedJSON_NoBidError(t *testing.T) {
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte("{not-json"))
    }))
    defer ts.Close()
    a := NewAdmostAdapter("app-1", "api-1")
    req := BidRequest{RequestID: "req-admost-6", Metadata: map[string]string{"test_endpoint": ts.URL}}
    resp, err := a.RequestBid(context.Background(), req)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !resp.NoBid || (resp.NoBidReason != NoBidError && resp.NoBidReason != "error") {
        t.Fatalf("expected standardized 'error', got %s", resp.NoBidReason)
    }
}


func TestAppLovin_302_NoRetry_andStatusReason(t *testing.T) {
	t := t
	var calls int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Header().Set("Location", "http://example.com")
		w.WriteHeader(http.StatusFound) // 302
	}))
	defer ts.Close()

	adapter := NewAppLovinAdapter("sdk-abc")
	req := BidRequest{RequestID: "req-applovin-302", Metadata: map[string]string{"applovin_ad_unit_id": "unit-1", "test_endpoint": ts.URL}}
	resp, _ := adapter.RequestBid(context.Background(), req)
	if !resp.NoBid || resp.NoBidReason != "status_302" {
		t.Fatalf("expected status_302, got noBid=%v reason=%s", resp.NoBid, resp.NoBidReason)
	}
	if atomic.LoadInt32(&calls) != 1 {
		t.Fatalf("expected exactly 1 call (no retry on 3xx), got %d", calls)
	}
}

func TestAppLovin_SlowBodyTimeout_MapsToTimeout(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if f, ok := w.(http.Flusher); ok { f.Flush() }
		time.Sleep(200 * time.Millisecond)
		_, _ = w.Write([]byte(`{"ad":{"cpm":1.0}}`))
	}))
	defer ts.Close()
	adapter := NewAppLovinAdapter("sdk-abc")
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	req := BidRequest{RequestID: "req-applovin-slow", Metadata: map[string]string{"applovin_ad_unit_id": "unit-1", "test_endpoint": ts.URL}}
	resp, _ := adapter.RequestBid(ctx, req)
	if !resp.NoBid || resp.NoBidReason != NoBidTimeout {
		t.Fatalf("expected timeout, got noBid=%v reason=%s", resp.NoBid, resp.NoBidReason)
	}
}

func TestChartboost_302_NoRetry_andStatusReason(t *testing.T) {
	var calls int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Header().Set("Location", "http://example.com")
		w.WriteHeader(http.StatusFound)
	}))
	defer ts.Close()
	ad := NewChartboostAdapter("app", "key")
	req := BidRequest{RequestID: "req-cb-302", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(context.Background(), req)
	if !resp.NoBid || resp.NoBidReason != "status_302" {
		t.Fatalf("expected status_302, got %s", resp.NoBidReason)
	}
	if atomic.LoadInt32(&calls) != 1 {
		t.Fatalf("expected exactly 1 call (no retry on 3xx), got %d", calls)
	}
}

func TestChartboost_SlowBodyTimeout_MapsToTimeout(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if f, ok := w.(http.Flusher); ok { f.Flush() }
		time.Sleep(200 * time.Millisecond)
		_, _ = w.Write([]byte(`{"ad":{"cpm":1.0}}`))
	}))
	defer ts.Close()
	ad := NewChartboostAdapter("app", "key")
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	req := BidRequest{RequestID: "req-cb-slow", Metadata: map[string]string{"test_endpoint": ts.URL}}
	resp, _ := ad.RequestBid(ctx, req)
	if !resp.NoBid || resp.NoBidReason != NoBidTimeout {
		t.Fatalf("expected timeout, got %s", resp.NoBidReason)
	}
}
