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

// UnityAdapter implements bidding for Unity Ads
type UnityAdapter struct {
	gameID string
	apiKey string
	client *http.Client

	// circuit breaker (shared, clock-enabled)
	cb *CircuitBreaker
}

// NewUnityAdapter creates a new Unity Ads adapter
func NewUnityAdapter(gameID, apiKey string) *UnityAdapter {
	return &UnityAdapter{
		gameID: gameID,
		apiKey: apiKey,
		client: &http.Client{Timeout: 5 * time.Second},
		cb:     NewCircuitBreaker(3, 30*time.Second),
	}
}

// RequestBid requests a bid from Unity Ads
func (u *UnityAdapter) RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error) {
	// Tracing span
	ctx, span := StartSpan(ctx, "adapter.request", map[string]string{"adapter": "unity"})
	defer span.End()
	// Circuit breaker: fail fast if open
	if u.isCircuitOpen() {
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "unity",
			NoBid:       true,
			NoBidReason: "circuit_open",
		}, nil
	}

	recordRequest("unity")
	callStart := time.Now()

	// Unity Ads Monetization API endpoint (allow test override for offline conformance)
	defaultPattern := "https://auction.unityads.unity3d.com/v6/games/%s/requests"
	url := fmt.Sprintf(defaultPattern, u.gameID)
	if ep, ok := req.Metadata["test_endpoint"]; ok && ep != "" {
		url = ep
	}

	// Build request
	payload := map[string]interface{}{
		"gameId":      u.gameID,
		"placementId": req.Metadata["unity_placement_id"],
		"platform":    req.DeviceInfo.OS,
		"deviceType":  u.getDeviceType(req.DeviceInfo.Make),
		"idfa":        req.UserInfo.AdvertisingID,
		"trackingAuthorizationStatus": u.getTrackingStatus(req.UserInfo.LimitAdTracking),
		"test":        req.Metadata["test_mode"] == "true",
	}

	reqBody, _ := json.Marshal(payload)

	var result map[string]interface{}
	operation := func() error {
		httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(reqBody))
		if err != nil {
			return err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", u.apiKey))

		startTime := time.Now()
		resp, err := u.client.Do(httpReq)
		latency := time.Since(startTime)
		if err != nil {
			log.WithError(err).WithField("latency_ms", latency.Milliseconds()).Error("Unity HTTP request failed")
			return err
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusNoContent {
			return fmt.Errorf("no_fill")
		}
		if resp.StatusCode != http.StatusOK {
			// Treat non-200 as no-bid, but surface for retry if transient
			return fmt.Errorf("status_%d", resp.StatusCode)
		}

		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return err
		}
		log.WithFields(log.Fields{
			"game_id":    u.gameID,
			"latency_ms": latency.Milliseconds(),
		}).Info("Unity bid response received")
		return nil
	}

	if err := DoWithRetry(ctx, operation); err != nil {
		u.onFailure()
		reason := MapErrorToNoBid(err)
		observeLatency("unity", float64(time.Since(callStart).Milliseconds()))
		if reason == NoBidNoFill {
			recordNoFill("unity")
		} else if reason == NoBidTimeout {
			recordTimeout("unity")
		} else {
			recordError("unity", reason)
		}
		span.SetAttr("outcome", "no_bid")
		span.SetAttr("reason", reason)
		CaptureDebugEventWithSpan(span, DebugEvent{
			PlacementID: req.PlacementID,
			RequestID:   req.RequestID,
			Adapter:     "unity",
			Outcome:     "no_bid",
			Reason:      reason,
			TimingsMS:   map[string]float64{"total": float64(time.Since(callStart).Milliseconds())},
		})
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "unity",
			NoBid:       true,
			NoBidReason: reason,
		}, nil
	}

	u.onSuccess()

	// Parse Unity response
	if fills, ok := result["fills"].([]interface{}); ok && len(fills) > 0 {
		fill := fills[0].(map[string]interface{})
		cpm := 0.0
		if bidPrice, ok := fill["bidPrice"].(float64); ok {
			cpm = bidPrice
		}
		resp := &BidResponse{
			BidID:       fmt.Sprintf("%v", fill["fillId"]),
			RequestID:   req.RequestID,
			AdapterName: "unity",
			CPM:         cpm,
			Currency:    "USD",
			CreativeID:  fmt.Sprintf("%v", fill["campaignId"]),
			AdMarkup:    fmt.Sprintf("%v", fill["adMarkup"]),
			ReceivedAt:  time.Now(),
		}
		observeLatency("unity", float64(time.Since(callStart).Milliseconds()))
		recordSuccess("unity")
		span.SetAttr("outcome", "success")
		return resp, nil
	}

	observeLatency("unity", float64(time.Since(callStart).Milliseconds()))
	recordNoFill("unity")
	span.SetAttr("outcome", "no_bid")
	span.SetAttr("reason", "no_fill")
	return &BidResponse{
		RequestID:   req.RequestID,
		AdapterName: "unity",
		NoBid:       true,
		NoBidReason: "no_fill",
	}, nil
}

func (u *UnityAdapter) getDeviceType(make string) string {
	if make == "tablet" {
		return "tablet"
	}
	return "phone"
}

func (u *UnityAdapter) getTrackingStatus(limited bool) int {
	if limited {
		return 3 // Denied
	}
	return 0 // Authorized
}

func (u *UnityAdapter) GetName() string {
	return "unity"
}

func (u *UnityAdapter) GetTimeout() time.Duration {
	return 5 * time.Second
}

// --- minimal resiliency helpers (retry + jitter + circuit breaker) ---

func (u *UnityAdapter) isCircuitOpen() bool {
	if u.cb == nil {
		return false
	}
	return !u.cb.Allow()
}

func (u *UnityAdapter) onFailure() {
	if u.cb != nil {
		u.cb.OnFailure()
	}
}

func (u *UnityAdapter) onSuccess() {
	if u.cb != nil {
		u.cb.OnSuccess()
	}
}

