package bidders

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	log "github.com/sirupsen/logrus"
)

// IronSourceAdapter implements bidding for ironSource
type IronSourceAdapter struct {
	appKey    string
	secretKey string
	client    *http.Client

	// circuit breaker (shared, clock-enabled)
	cb *CircuitBreaker
}

// NewIronSourceAdapter creates a new ironSource adapter
func NewIronSourceAdapter(appKey, secretKey string) *IronSourceAdapter {
	return &IronSourceAdapter{
		appKey:    appKey,
		secretKey: secretKey,
		client:    &http.Client{Timeout: 5 * time.Second},
		cb:        NewCircuitBreaker(3, 30*time.Second),
	}
}

// RequestBid requests a bid from ironSource
func (i *IronSourceAdapter) RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error) {
	// Tracing span
	ctx, span := StartSpan(ctx, "adapter.request", map[string]string{"adapter": "ironsource"})
	defer span.End()
	// Circuit breaker: fail fast if open
	if i.isCircuitOpen() {
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "ironsource",
			NoBid:       true,
			NoBidReason: "circuit_open",
		}, nil
	}

	recordRequest("ironsource")
	callStart := time.Now()

	endpoint := "https://outcome-ssp.supersonicads.com/mediation"
	// Test override for offline conformance tests
	if ep, ok := req.Metadata["test_endpoint"]; ok && ep != "" {
		endpoint = ep
	}

	payload := map[string]interface{}{
		"appKey":        i.appKey,
		"instanceId":    req.Metadata["ironsource_instance_id"],
		"adUnit":        req.AdType,
		"bundleId":      req.AppID,
		"platform":      req.DeviceInfo.OS,
		"osVersion":     req.DeviceInfo.OSVersion,
		"deviceModel":   req.DeviceInfo.Model,
		"advertisingId": req.UserInfo.AdvertisingID,
		"lmt":           req.UserInfo.LimitAdTracking,
		"ip":            req.DeviceInfo.IP,
		"country":       req.Metadata["country_code"],
		"test":          req.Metadata["test_mode"] == "true",
	}

	reqBody, _ := json.Marshal(payload)

	var result map[string]interface{}
	operation := func() error {
		httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(reqBody))
		if err != nil {
			return err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", i.secretKey))

		startTime := time.Now()
		resp, err := i.client.Do(httpReq)
		latency := time.Since(startTime)
		if err != nil {
			log.WithError(err).WithField("latency_ms", latency.Milliseconds()).Error("ironSource HTTP request failed")
			return err
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusNoContent {
			return fmt.Errorf("no_fill")
		}
		if resp.StatusCode != http.StatusOK {
			// transient only for 5xx via DoWithRetry
			return fmt.Errorf("status_%d", resp.StatusCode)
		}

		// read and decode
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return err
		}

		log.WithFields(log.Fields{
			"app_key":    maskKey(i.appKey),
			"latency_ms": latency.Milliseconds(),
		}).Info("ironSource bid response received")
		return nil
	}

	if err := DoWithRetry(ctx, operation); err != nil {
		i.onFailure()
		reason := MapErrorToNoBid(err)
		observeLatency("ironsource", float64(time.Since(callStart).Milliseconds()))
		if reason == NoBidNoFill {
			recordNoFill("ironsource")
		} else if reason == NoBidTimeout {
			recordTimeout("ironsource")
		} else {
			recordError("ironsource", reason)
		}
		span.SetAttr("outcome", "no_bid")
		span.SetAttr("reason", reason)
		CaptureDebugEvent(DebugEvent{
			PlacementID: req.PlacementID,
			RequestID:   req.RequestID,
			Adapter:     "ironsource",
			Outcome:     "no_bid",
			Reason:      reason,
			TimingsMS:   map[string]float64{"total": float64(time.Since(callStart).Milliseconds())},
		})
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "ironsource",
			NoBid:       true,
			NoBidReason: reason,
		}, nil
	}

	i.onSuccess()

	// Parse ironSource response
	if providerName, ok := result["providerName"].(string); ok && providerName != "" {
		cpm := 0.0
		if revenue, ok := result["revenue"].(float64); ok {
			cpm = revenue
		}
		resp := &BidResponse{
			BidID:       fmt.Sprintf("%v", result["auctionId"]),
			RequestID:   req.RequestID,
			AdapterName: "ironsource",
			CPM:         cpm,
			Currency:    "USD",
			CreativeID:  fmt.Sprintf("%v", result["creativeId"]),
			AdMarkup:    fmt.Sprintf("%v", result["adMarkup"]),
			ReceivedAt:  time.Now(),
			Metadata: map[string]string{
				"provider":    providerName,
				"instance_id": fmt.Sprintf("%v", result["instanceId"]),
			},
		}
		observeLatency("ironsource", float64(time.Since(callStart).Milliseconds()))
		recordSuccess("ironsource")
		span.SetAttr("outcome", "success")
		return resp, nil
	}

	observeLatency("ironsource", float64(time.Since(callStart).Milliseconds()))
	recordNoFill("ironsource")
	span.SetAttr("outcome", "no_bid")
	span.SetAttr("reason", "no_fill")
	return &BidResponse{
		RequestID:   req.RequestID,
		AdapterName: "ironsource",
		NoBid:       true,
		NoBidReason: "no_fill",
	}, nil
}

func (i *IronSourceAdapter) GetName() string {
	return "ironsource"
}

func (i *IronSourceAdapter) GetTimeout() time.Duration {
	return 5 * time.Second
}

// --- minimal resiliency helpers (retry + jitter + circuit breaker) ---

func (i *IronSourceAdapter) isCircuitOpen() bool {
	if i.cb == nil {
		return false
	}
	return !i.cb.Allow()
}

func (i *IronSourceAdapter) onFailure() {
	if i.cb != nil {
		i.cb.OnFailure()
	}
}

func (i *IronSourceAdapter) onSuccess() {
	if i.cb != nil {
		i.cb.OnSuccess()
	}
}
