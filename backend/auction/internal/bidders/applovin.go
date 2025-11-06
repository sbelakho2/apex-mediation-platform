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

// AppLovinAdapter implements bidding for AppLovin MAX
type AppLovinAdapter struct {
	sdkKey string
	client *http.Client

	// circuit breaker (shared, clock-enabled)
	cb *CircuitBreaker
}

// NewAppLovinAdapter creates a new AppLovin MAX adapter
func NewAppLovinAdapter(sdkKey string) *AppLovinAdapter {
	return &AppLovinAdapter{
		sdkKey: sdkKey,
		client: &http.Client{Timeout: 5 * time.Second},
		cb:     NewCircuitBreaker(3, 30*time.Second),
	}
}

// RequestBid requests a bid from AppLovin MAX
func (a *AppLovinAdapter) RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error) {
	// Tracing span
	ctx, span := StartSpan(ctx, "adapter.request", map[string]string{"adapter": "applovin"})
	defer span.End()
	// Circuit breaker: fail fast if open
	if a.isCircuitOpen() {
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "applovin",
			NoBid:       true,
			NoBidReason: "circuit_open",
		}, nil
	}

	recordRequest("applovin")
	callStart := time.Now()

	// AppLovin MAX Bidding API
	endpoint := "https://ms.applovin.com/mediation/v1/ad_request"
	// Test override: allow endpoint replacement via req.Metadata["test_endpoint"] for offline conformance tests
	if ep, ok := req.Metadata["test_endpoint"]; ok && ep != "" {
		endpoint = ep
	}

	// Build request
	payload := map[string]interface{}{
		"sdk_key":       a.sdkKey,
		"ad_unit_id":    req.Metadata["applovin_ad_unit_id"],
		"ad_format":     req.AdType,
		"package_name":  req.AppID,
		"platform":      req.DeviceInfo.OS,
		"os_version":    req.DeviceInfo.OSVersion,
		"device_model":  req.DeviceInfo.Model,
		"idfa":          req.UserInfo.AdvertisingID,
		"dnt":           req.UserInfo.LimitAdTracking,
		"country_code":  req.Metadata["country_code"],
		"test_mode":     req.Metadata["test_mode"] == "true",
		"floor_price":   req.FloorCPM,
	}

	reqBody, _ := json.Marshal(payload)

	var result map[string]interface{}
	operation := func() error {
		httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(reqBody))
		if err != nil {
			return err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("User-Agent", "ApexMediation-Mediation/1.0")

		startTime := time.Now()
		resp, err := a.client.Do(httpReq)
		latency := time.Since(startTime)
		if err != nil {
			log.WithError(err).WithField("latency_ms", latency.Milliseconds()).Error("AppLovin HTTP request failed")
			return err
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusNoContent {
			return fmt.Errorf("no_fill")
		}
		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("status_%d", resp.StatusCode)
		}

		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return err
		}

		log.WithFields(log.Fields{
			"sdk_key":    maskKey(a.sdkKey),
			"latency_ms": latency.Milliseconds(),
		}).Info("AppLovin bid response received")
		return nil
	}

	if err := DoWithRetry(ctx, operation); err != nil {
		a.onFailure()
		reason := MapErrorToNoBid(err)
		observeLatency("applovin", float64(time.Since(callStart).Milliseconds()))
		if reason == NoBidNoFill {
			recordNoFill("applovin")
		} else if reason == NoBidTimeout {
			recordTimeout("applovin")
		} else {
			recordError("applovin", reason)
		}
		span.SetAttr("outcome", "no_bid")
		span.SetAttr("reason", reason)
		CaptureDebugEvent(DebugEvent{
			PlacementID: req.PlacementID,
			RequestID:   req.RequestID,
			Adapter:     "applovin",
			Outcome:     "no_bid",
			Reason:      reason,
			TimingsMS:   map[string]float64{"total": float64(time.Since(callStart).Milliseconds())},
		})
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "applovin",
			NoBid:       true,
			NoBidReason: reason,
		}, nil
	}

	a.onSuccess()

	// Parse AppLovin response
	var generic *BidResponse
	if ad, ok := result["ad"].(map[string]interface{}); ok {
		cpm := 0.0
		if revenue, ok := ad["revenue"].(float64); ok {
			cpm = revenue * 1000 // Convert to CPM
		}
		generic = &BidResponse{
			BidID:       fmt.Sprintf("%v", ad["ad_id"]),
			RequestID:   req.RequestID,
			AdapterName: "applovin",
			CPM:         cpm,
			Currency:    "USD",
			CreativeID:  fmt.Sprintf("%v", ad["creative_id"]),
			AdMarkup:    fmt.Sprintf("%v", ad["html"]),
			ReceivedAt:  time.Now(),
			Metadata: map[string]string{
				"network": fmt.Sprintf("%v", ad["network"]),
			},
		}
	} else {
		generic = &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "applovin",
			NoBid:       true,
			NoBidReason: NoBidError,
		}
	}

	observeLatency("applovin", float64(time.Since(callStart).Milliseconds()))
	if generic.NoBid {
		if generic.NoBidReason == NoBidNoFill {
			recordNoFill("applovin")
		} else if generic.NoBidReason == NoBidTimeout {
			recordTimeout("applovin")
		} else {
			recordError("applovin", generic.NoBidReason)
		}
		span.SetAttr("outcome", "no_bid")
		span.SetAttr("reason", generic.NoBidReason)
	} else {
		recordSuccess("applovin")
		span.SetAttr("outcome", "success")
	}
	return generic, nil
}

func (a *AppLovinAdapter) GetName() string {
	return "applovin"
}

func (a *AppLovinAdapter) GetTimeout() time.Duration {
	return 5 * time.Second
}

// --- minimal resiliency helpers (retry + jitter + circuit breaker) ---

func (a *AppLovinAdapter) isCircuitOpen() bool {
	if a.cb == nil {
		return false
	}
	return !a.cb.Allow()
}

func (a *AppLovinAdapter) onFailure() {
	if a.cb != nil {
		a.cb.OnFailure()
	}
}

func (a *AppLovinAdapter) onSuccess() {
	if a.cb != nil {
		a.cb.OnSuccess()
	}
}

