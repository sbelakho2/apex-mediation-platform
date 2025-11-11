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

// AdmostAdapter implements bidding for Admost (placeholder S2S)
type AdmostAdapter struct {
	appID  string
	apiKey string
	client *http.Client
	cb     *CircuitBreaker
}

// NewAdmostAdapter creates a new Admost adapter
func NewAdmostAdapter(appID, apiKey string) *AdmostAdapter {
	return &AdmostAdapter{
		appID:  appID,
		apiKey: apiKey,
		client: &http.Client{Timeout: 5 * time.Second},
		cb:     NewCircuitBreaker(3, 30*time.Second),
	}
}

// RequestBid requests a bid from Admost
func (a *AdmostAdapter) RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error) {
	// Tracing span
	ctx, span := StartSpan(ctx, "adapter.request", map[string]string{"adapter": "admost"})
	defer span.End()
	// Circuit breaker fast-fail
	if a.isCircuitOpen() {
		recordError("admost", NoBidCircuitOpen)
		CaptureDebugEventWithSpan(span, DebugEvent{PlacementID: req.PlacementID, RequestID: req.RequestID, Adapter: "admost", Outcome: "no_bid", Reason: NoBidCircuitOpen, CreatedAt: time.Now()})
		return &BidResponse{RequestID: req.RequestID, AdapterName: "admost", NoBid: true, NoBidReason: NoBidCircuitOpen}, nil
	}

	recordRequest("admost")
	callStart := time.Now()

	endpoint := "https://api.admost.com/s2s/bid"
	if ep, ok := req.Metadata["test_endpoint"]; ok && ep != "" {
		endpoint = ep
	}

	payload := map[string]any{
		"app_id":       a.appID,
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
		h.Header.Set("Authorization", fmt.Sprintf("Bearer %s", a.apiKey))

		start := time.Now()
		resp, err := a.client.Do(h)
		lat := time.Since(start)
		if err != nil { return err }
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusNoContent { return fmt.Errorf("%s", NoBidNoFill) }
		if resp.StatusCode != http.StatusOK { return fmt.Errorf("status_%d", resp.StatusCode) }
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil { return err }
		log.WithFields(log.Fields{"adapter": "admost", "latency_ms": lat.Milliseconds()}).Info("Admost bid response")
		return nil
	}

	if err := DoWithRetry(ctx, operation); err != nil {
		a.onFailure()
		reason := MapErrorToNoBid(err)
		observeLatency("admost", float64(time.Since(callStart).Milliseconds()))
		if reason == NoBidTimeout { recordTimeout("admost") } else if reason == NoBidNoFill { recordNoFill("admost") } else { recordError("admost", reason) }
		CaptureDebugEventWithSpan(span, DebugEvent{PlacementID: req.PlacementID, RequestID: req.RequestID, Adapter: "admost", Outcome: "no_bid", Reason: reason, CreatedAt: time.Now()})
		span.SetAttributes(map[string]string{"outcome": "no_bid", "reason": reason})
		return &BidResponse{RequestID: req.RequestID, AdapterName: "admost", NoBid: true, NoBidReason: reason}, nil
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
		BidID:       fmt.Sprintf("%s-admost", req.RequestID),
		RequestID:   req.RequestID,
		AdapterName: "admost",
		CPM:         cpm,
		Currency:    "USD",
		CreativeID:  creativeID,
		AdMarkup:    markup,
		ReceivedAt:  time.Now(),
	}

	a.onSuccess()
	observeLatency("admost", float64(time.Since(callStart).Milliseconds()))
	recordSuccess("admost")
	CaptureDebugEventWithSpan(span, DebugEvent{PlacementID: req.PlacementID, RequestID: req.RequestID, Adapter: "admost", Outcome: "success", ReqSummary: map[string]any{"floor": req.FloorCPM}, RespSummary: map[string]any{"cpm": cpm}, CreatedAt: time.Now()})
	span.SetAttributes(map[string]string{"outcome": "success"})
	return br, nil
}

func (a *AdmostAdapter) isCircuitOpen() bool { return !a.cb.Allow() }
func (a *AdmostAdapter) onFailure()          { a.cb.OnFailure() }
func (a *AdmostAdapter) onSuccess()          { a.cb.OnSuccess() }

// GetName returns adapter name
func (a *AdmostAdapter) GetName() string { return "admost" }

// GetTimeout returns default timeout
func (a *AdmostAdapter) GetTimeout() time.Duration { return 5 * time.Second }
