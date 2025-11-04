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

// IronSourceAdapter implements bidding for ironSource
type IronSourceAdapter struct {
	appKey string
	secretKey string
	client *http.Client
}

// NewIronSourceAdapter creates a new ironSource adapter
func NewIronSourceAdapter(appKey, secretKey string) *IronSourceAdapter {
	return &IronSourceAdapter{
		appKey:    appKey,
		secretKey: secretKey,
		client:    &http.Client{Timeout: 5 * time.Second},
	}
}

// RequestBid requests a bid from ironSource
func (i *IronSourceAdapter) RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error) {
	// ironSource Mediation API
	endpoint := "https://outcome-ssp.supersonicads.com/mediation"

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
	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", i.secretKey))

	startTime := time.Now()
	resp, err := i.client.Do(httpReq)
	latency := time.Since(startTime)

	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "ironsource",
			NoBid:       true,
			NoBidReason: fmt.Sprintf("status_%d", resp.StatusCode),
		}, nil
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	// Parse ironSource response
	if providerName, ok := result["providerName"].(string); ok && providerName != "" {
		cpm := 0.0
		if revenue, ok := result["revenue"].(float64); ok {
			cpm = revenue
		}

		log.WithFields(log.Fields{
			"app_key":    i.appKey[:10] + "...",
			"latency_ms": latency.Milliseconds(),
			"cpm":        cpm,
			"provider":   providerName,
		}).Info("ironSource bid response received")

		return &BidResponse{
			BidID:       fmt.Sprintf("%v", result["auctionId"]),
			RequestID:   req.RequestID,
			AdapterName: "ironsource",
			CPM:         cpm,
			Currency:    "USD",
			CreativeID:  fmt.Sprintf("%v", result["creativeId"]),
			AdMarkup:    fmt.Sprintf("%v", result["adMarkup"]),
			ReceivedAt:  time.Now(),
			Metadata: map[string]string{
				"provider": providerName,
				"instance_id": fmt.Sprintf("%v", result["instanceId"]),
			},
		}, nil
	}

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
