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
	gameID    string
	apiKey    string
	client    *http.Client
}

// NewUnityAdapter creates a new Unity Ads adapter
func NewUnityAdapter(gameID, apiKey string) *UnityAdapter {
	return &UnityAdapter{
		gameID: gameID,
		apiKey: apiKey,
		client: &http.Client{Timeout: 5 * time.Second},
	}
}

// RequestBid requests a bid from Unity Ads
func (u *UnityAdapter) RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error) {
	// Unity Ads Monetization API endpoint
	endpoint := "https://auction.unityads.unity3d.com/v6/games/%s/requests"
	url := fmt.Sprintf(endpoint, u.gameID)

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
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", u.apiKey))

	startTime := time.Now()
	resp, err := u.client.Do(httpReq)
	latency := time.Since(startTime)

	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "unity",
			NoBid:       true,
			NoBidReason: fmt.Sprintf("status_%d", resp.StatusCode),
		}, nil
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	// Parse Unity response
	if fills, ok := result["fills"].([]interface{}); ok && len(fills) > 0 {
		fill := fills[0].(map[string]interface{})
		cpm := 0.0
		if bidPrice, ok := fill["bidPrice"].(float64); ok {
			cpm = bidPrice
		}

		log.WithFields(log.Fields{
			"game_id":    u.gameID,
			"latency_ms": latency.Milliseconds(),
			"cpm":        cpm,
		}).Info("Unity bid response received")

		return &BidResponse{
			BidID:       fmt.Sprintf("%v", fill["fillId"]),
			RequestID:   req.RequestID,
			AdapterName: "unity",
			CPM:         cpm,
			Currency:    "USD",
			CreativeID:  fmt.Sprintf("%v", fill["campaignId"]),
			AdMarkup:    fmt.Sprintf("%v", fill["adMarkup"]),
			ReceivedAt:  time.Now(),
		}, nil
	}

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
