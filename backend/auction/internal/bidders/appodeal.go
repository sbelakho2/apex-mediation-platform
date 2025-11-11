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

// AppodealAdapter implements bidding for Appodeal (placeholder S2S)
type AppodealAdapter struct {
	appKey string
	client *http.Client
	cb     *CircuitBreaker
}

// NewAppodealAdapter creates a new Appodeal adapter
func NewAppodealAdapter(appKey string) *AppodealAdapter {
	return &AppodealAdapter{
		appKey: appKey,
		client: &http.Client{Timeout: 5 * time.Second},
		cb:     NewCircuitBreaker(3, 30*time.Second),
	}
}

// RequestBid requests a bid from Appodeal
func (a *AppodealAdapter) RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error) {
	ctx, span := StartSpan(ctx, "adapter.request", map[string]string{"adapter": "appodeal"})
	defer span.End()

	if a.isCircuitOpen() {
		recordError("appodeal", NoBidCircuitOpen)
		CaptureDebugEventWithSpan(span, DebugEvent{PlacementID: req.PlacementID, RequestID: req.RequestID, Adapter: "appodeal", Outcome: "no_bid", Reason: NoBidCircuitOpen, CreatedAt: time.Now()})
		return &BidResponse{RequestID: req.RequestID, AdapterName: "appodeal", NoBid: true, NoBidReason: NoBidCircuitOpen}, nil
	}

	recordRequest("appodeal")
	callStart := time.Now()

	endpoint := "https://api.appodealx.com/s2s/bid"
	if ep, ok := req.Metadata["test_endpoint"]; ok && ep != "" { endpoint = ep }

	payload := map[string]any{
		"app_key":      a.appKey,
		"placement_id": req.PlacementID,
		"ad_type":      req.AdType,
		"bundle_id":    req.AppID,
		"os":           req.DeviceInfo.OS,
		"os_version":   req.DeviceInfo.OSVersion,
		"model":        req.DeviceInfo.Model,
		"ifa":          req.UserInfo.AdvertisingID,
		"lmt":          req.UserInfo.LimitAdTracking,
		"floor_cpm":    req.FloorCPM,
	}
	body, _ := json.Marshal(payload)

	var result map[string]any
	operation := func() error {
		h, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil { return err }
		h.Header.Set("Content-Type", "application/json")
		h.Header.Set("X-Appodeal-Key", a.appKey)

		start := time.Now()
		resp, err := a.client.Do(h)
		lat := time.Since(start)
		if err != nil { return err }
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusNoContent { return fmt.Errorf("%s", NoBidNoFill) }
		if resp.StatusCode != http.StatusOK { return fmt.Errorf("status_%d", resp.StatusCode) }
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil { return err }
		log.WithFields(log.Fields{"adapter": "appodeal", "latency_ms": lat.Milliseconds()}).Info("Appodeal bid response")
		return nil
	}

	if err := DoWithRetry(ctx, operation); err != nil {
		a.onFailure()
		reason := MapErrorToNoBid(err)
		observeLatency("appodeal", float64(time.Since(callStart).Milliseconds()))
		if reason == NoBidTimeout { recordTimeout("appodeal") } else if reason == NoBidNoFill { recordNoFill("appodeal") } else { recordError("appodeal", reason) }
		CaptureDebugEventWithSpan(span, DebugEvent{PlacementID: req.PlacementID, RequestID: req.RequestID, Adapter: "appodeal", Outcome: "no_bid", Reason: reason, CreatedAt: time.Now()})
		span.SetAttributes(map[string]string{"outcome": "no_bid", "reason": reason})
		return &BidResponse{RequestID: req.RequestID, AdapterName: "appodeal", NoBid: true, NoBidReason: reason}, nil
	}

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
		BidID:       fmt.Sprintf("%s-appodeal", req.RequestID),
		RequestID:   req.RequestID,
		AdapterName: "appodeal",
		CPM:         cpm,
		Currency:    "USD",
		CreativeID:  creativeID,
		AdMarkup:    markup,
		ReceivedAt:  time.Now(),
	}

	a.onSuccess()
	observeLatency("appodeal", float64(time.Since(callStart).Milliseconds()))
	recordSuccess("appodeal")
	CaptureDebugEventWithSpan(span, DebugEvent{PlacementID: req.PlacementID, RequestID: req.RequestID, Adapter: "appodeal", Outcome: "success", ReqSummary: map[string]any{"floor": req.FloorCPM}, RespSummary: map[string]any{"cpm": cpm}, CreatedAt: time.Now()})
	span.SetAttributes(map[string]string{"outcome": "success"})
	return br, nil
}

func (a *AppodealAdapter) isCircuitOpen() bool { return !a.cb.Allow() }
func (a *AppodealAdapter) onFailure()          { a.cb.OnFailure() }
func (a *AppodealAdapter) onSuccess()          { a.cb.OnSuccess() }

// GetName returns adapter name
func (a *AppodealAdapter) GetName() string { return "appodeal" }

// GetTimeout returns default timeout
func (a *AppodealAdapter) GetTimeout() time.Duration { return 5 * time.Second }
