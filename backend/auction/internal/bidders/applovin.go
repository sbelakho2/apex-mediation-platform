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
}

// NewAppLovinAdapter creates a new AppLovin MAX adapter
func NewAppLovinAdapter(sdkKey string) *AppLovinAdapter {
	return &AppLovinAdapter{
		sdkKey: sdkKey,
		client: &http.Client{Timeout: 5 * time.Second},
	}
}

// RequestBid requests a bid from AppLovin MAX
func (a *AppLovinAdapter) RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error) {
	// AppLovin MAX Bidding API
	endpoint := "https://ms.applovin.com/mediation/v1/ad_request"

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
	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("User-Agent", "ApexMediation-Mediation/1.0")

	startTime := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(startTime)

	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNoContent {
		// No fill
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "applovin",
			NoBid:       true,
			NoBidReason: "no_fill",
		}, nil
	}

	if resp.StatusCode != http.StatusOK {
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "applovin",
			NoBid:       true,
			NoBidReason: fmt.Sprintf("status_%d", resp.StatusCode),
		}, nil
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	// Parse AppLovin response
	if ad, ok := result["ad"].(map[string]interface{}); ok {
		cpm := 0.0
		if revenue, ok := ad["revenue"].(float64); ok {
			cpm = revenue * 1000 // Convert to CPM
		}

		log.WithFields(log.Fields{
			"sdk_key":    a.sdkKey[:10] + "...",
			"latency_ms": latency.Milliseconds(),
			"cpm":        cpm,
		}).Info("AppLovin bid response received")

		return &BidResponse{
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
		}, nil
	}

	return &BidResponse{
		RequestID:   req.RequestID,
		AdapterName: "applovin",
		NoBid:       true,
		NoBidReason: "invalid_response",
	}, nil
}

func (a *AppLovinAdapter) GetName() string {
	return "applovin"
}

func (a *AppLovinAdapter) GetTimeout() time.Duration {
	return 5 * time.Second
}
