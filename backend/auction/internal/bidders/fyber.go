package bidders

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	log "github.com/sirupsen/logrus"
)

// FyberAdapter implements bidding for Fyber (Digital Turbine FairBid)
type FyberAdapter struct {
	appID  string
	apiKey string
	client *http.Client
	cb     *CircuitBreaker
}

// NewFyberAdapter creates a new Fyber adapter (S2S placeholder)
func NewFyberAdapter(appID, apiKey string) *FyberAdapter {
	return &FyberAdapter{
		appID:  appID,
		apiKey: apiKey,
		client: &http.Client{Timeout: 5 * time.Second},
		cb:     NewCircuitBreaker(3, 30*time.Second),
	}
}

// RequestBid requests a bid from Fyber (using a simplified placeholder schema)
func (f *FyberAdapter) RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error) {
	ctx, span := StartSpan(ctx, "adapter.request", map[string]string{"adapter": "fyber"})
	defer span.End()

	if f.isCircuitOpen() {
		recordError("fyber", NoBidCircuitOpen)
		CaptureDebugEventWithSpan(span, DebugEvent{PlacementID: req.PlacementID, RequestID: req.RequestID, Adapter: "fyber", Outcome: "no_bid", Reason: NoBidCircuitOpen, CreatedAt: time.Now()})
		return &BidResponse{RequestID: req.RequestID, AdapterName: "fyber", NoBid: true, NoBidReason: NoBidCircuitOpen}, nil
	}

	recordRequest("fyber")
	callStart := time.Now()

	// Default (placeholder) endpoint; tests can override via metadata["test_endpoint"]
	endpoint := "https://api.fairbid.com/s2s/bid"
	if ep, ok := req.Metadata["test_endpoint"]; ok && ep != "" { endpoint = ep }

	payload := map[string]any{
		"app_id":      f.appID,
		"placement_id": req.PlacementID,
		"ad_type":     req.AdType,
		"bundle_id":   req.AppID,
		"os":          req.DeviceInfo.OS,
		"os_version":  req.DeviceInfo.OSVersion,
		"model":       req.DeviceInfo.Model,
		"ifa":         req.UserInfo.AdvertisingID,
		"lmt":         req.UserInfo.LimitAdTracking,
		"floor_cpm":   req.FloorCPM,
	}
	body, _ := json.Marshal(payload)

	var result map[string]any
	operation := func() error {
		h, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil { return err }
		h.Header.Set("Content-Type", "application/json")
		h.Header.Set("Authorization", fmt.Sprintf("Bearer %s", f.apiKey))

		start := time.Now()
		resp, err := f.client.Do(h)
		lat := time.Since(start)
		if err != nil { return err }
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusNoContent { return fmt.Errorf("%s", NoBidNoFill) }
		if resp.StatusCode != http.StatusOK { return fmt.Errorf("status_%d", resp.StatusCode) }
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil { return err }
		log.WithFields(log.Fields{"adapter": "fyber", "latency_ms": lat.Milliseconds()}).Info("Fyber bid response")
		return nil
	}

	if err := DoWithRetry(ctx, operation); err != nil {
		f.onFailure();
		reason := MapErrorToNoBid(err)
		observeLatency("fyber", float64(time.Since(callStart).Milliseconds()))
		if reason == NoBidTimeout { recordTimeout("fyber") } else if reason == NoBidNoFill { recordNoFill("fyber") } else { recordError("fyber", reason) }
		CaptureDebugEventWithSpan(span, DebugEvent{PlacementID: req.PlacementID, RequestID: req.RequestID, Adapter: "fyber", Outcome: "no_bid", Reason: reason, CreatedAt: time.Now()})
		span.SetAttributes(map[string]string{"outcome": "no_bid", "reason": reason})
		return &BidResponse{RequestID: req.RequestID, AdapterName: "fyber", NoBid: true, NoBidReason: reason}, nil
	}

	// Parse simple schema into BidResponse
	ad := map[string]any{}
	if v, ok := result["ad"].(map[string]any); ok { ad = v }
	cpm := 0.0
	if v, ok := result["cpm"].(float64); ok { cpm = v }
	if v, ok := ad["cpm"].(float64); ok { cpm = v }
	markup := ""
	if v, ok := ad["html"].(string); ok { markup = v }
	if v, ok := ad["ad_markup"].(string); ok { markup = v }
	creativeID := ""
	if v, ok := ad["creative_id"].(string); ok { creativeID = v }

	br := &BidResponse{
		BidID:       fmt.Sprintf("%s-fyber", req.RequestID),
		RequestID:   req.RequestID,
		AdapterName: "fyber",
		CPM:         cpm,
		Currency:    "USD",
		CreativeID:  creativeID,
		AdMarkup:    markup,
		ReceivedAt:  time.Now(),
	}

	f.onSuccess()
	observeLatency("fyber", float64(time.Since(callStart).Milliseconds()))
	recordSuccess("fyber")
	CaptureDebugEventWithSpan(span, DebugEvent{PlacementID: req.PlacementID, RequestID: req.RequestID, Adapter: "fyber", Outcome: "success", ReqSummary: map[string]any{"floor": req.FloorCPM}, RespSummary: map[string]any{"cpm": cpm}, CreatedAt: time.Now()})
	span.SetAttributes(map[string]string{"outcome": "success"})
	return br, nil
}

func (f *FyberAdapter) isCircuitOpen() bool { return !f.cb.Allow() }
func (f *FyberAdapter) onFailure()          { f.cb.OnFailure() }
func (f *FyberAdapter) onSuccess()          { f.cb.OnSuccess() }

// GetName returns adapter name
func (f *FyberAdapter) GetName() string { return "fyber" }

// GetTimeout returns default timeout
func (f *FyberAdapter) GetTimeout() time.Duration { return 5 * time.Second }
