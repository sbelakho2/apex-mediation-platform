package bidders

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// ChartboostAdapter implements a minimal S2S bidder for Chartboost with standardized resiliency
// and observability hooks. It supports a test_endpoint override for offline conformance tests.
type ChartboostAdapter struct {
	appID  string
	apiKey string
	client *http.Client
	cb     *CircuitBreaker
}

func NewChartboostAdapter(appID, apiKey string) *ChartboostAdapter {
	return &ChartboostAdapter{
		appID:  appID,
		apiKey: apiKey,
		client: &http.Client{Timeout: 5 * time.Second},
		cb:     NewCircuitBreaker(3, 30*time.Second),
	}
}

func (a *ChartboostAdapter) GetName() string { return "chartboost" }
func (a *ChartboostAdapter) GetTimeout() time.Duration { return 5 * time.Second }

func (a *ChartboostAdapter) RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error) {
	ctx, span := StartSpan(ctx, "adapter.request", map[string]string{"adapter": a.GetName()})
	defer span.End()

	if !a.cb.Allow() {
		recordError(a.GetName(), NoBidCircuitOpen)
		CaptureDebugEvent(DebugEvent{PlacementID: req.PlacementID, RequestID: req.RequestID, Adapter: a.GetName(), Outcome: "no_bid", Reason: NoBidCircuitOpen, CreatedAt: time.Now()})
		return &BidResponse{RequestID: req.RequestID, AdapterName: a.GetName(), NoBid: true, NoBidReason: NoBidCircuitOpen}, nil
	}

	recordRequest(a.GetName())
	start := time.Now()

	endpoint := "https://api.chartboost.com/s2s/bid"
	if ep, ok := req.Metadata["test_endpoint"]; ok && ep != "" {
		endpoint = ep
	}
	payload := map[string]any{
		"app_id":       a.appID,
		"placement_id": req.PlacementID,
		"ad_type":      req.AdType,
		"bundle_id":    req.AppID,
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
		h.Header.Set("X-Api-Key", a.apiKey)

		resp, err := a.client.Do(h)
		if err != nil { return err }
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusNoContent { return fmt.Errorf("%s", NoBidNoFill) }
		if resp.StatusCode != http.StatusOK { return fmt.Errorf("status_%d", resp.StatusCode) }
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil { return err }
		return nil
	}

	if err := DoWithRetry(ctx, operation); err != nil {
		a.cb.OnFailure()
		reason := MapErrorToNoBid(err)
		observeLatency(a.GetName(), float64(time.Since(start).Milliseconds()))
		if reason == NoBidTimeout { recordTimeout(a.GetName()) } else if reason == NoBidNoFill { recordNoFill(a.GetName()) } else { recordError(a.GetName(), reason) }
		CaptureDebugEvent(DebugEvent{PlacementID: req.PlacementID, RequestID: req.RequestID, Adapter: a.GetName(), Outcome: "no_bid", Reason: reason, CreatedAt: time.Now()})
		span.SetAttributes(map[string]string{"outcome": "no_bid", "reason": reason})
		return &BidResponse{RequestID: req.RequestID, AdapterName: a.GetName(), NoBid: true, NoBidReason: reason}, nil
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
		BidID:       fmt.Sprintf("%s-%s", req.RequestID, a.GetName()),
		RequestID:   req.RequestID,
		AdapterName: a.GetName(),
		CPM:         cpm,
		Currency:    "USD",
		CreativeID:  creativeID,
		AdMarkup:    markup,
		ReceivedAt:  time.Now(),
	}

	a.cb.OnSuccess()
	observeLatency(a.GetName(), float64(time.Since(start).Milliseconds()))
	recordSuccess(a.GetName())
	CaptureDebugEvent(DebugEvent{PlacementID: req.PlacementID, RequestID: req.RequestID, Adapter: a.GetName(), Outcome: "success", ReqSummary: map[string]any{"floor": req.FloorCPM}, RespSummary: map[string]any{"cpm": cpm}, CreatedAt: time.Now()})
	span.SetAttributes(map[string]string{"outcome": "success"})
	return br, nil
}
