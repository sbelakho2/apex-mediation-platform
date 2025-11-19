package bidders

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// MolocoAdapter implements a simple S2S bidder for Moloco demand.
type MolocoAdapter struct {
	seatID string
	apiKey string
	client *http.Client
	cb     *CircuitBreaker
}

// NewMolocoAdapter builds the adapter with sane defaults.
func NewMolocoAdapter(seatID, apiKey string) *MolocoAdapter {
	return &MolocoAdapter{
		seatID: seatID,
		apiKey: apiKey,
		client: &http.Client{Timeout: 5 * time.Second},
		cb:     NewCircuitBreaker(3, 30*time.Second),
	}
}

func (m *MolocoAdapter) GetName() string           { return "moloco" }
func (m *MolocoAdapter) GetTimeout() time.Duration { return 5 * time.Second }

// RequestBid executes a Moloco RTB request.
func (m *MolocoAdapter) RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error) {
	ctx, span := StartSpan(ctx, "adapter.request", map[string]string{"adapter": m.GetName()})
	defer span.End()

	if !m.cb.Allow() {
		recordError(m.GetName(), NoBidCircuitOpen)
		return &BidResponse{RequestID: req.RequestID, AdapterName: m.GetName(), NoBid: true, NoBidReason: NoBidCircuitOpen}, nil
	}

	recordRequest(m.GetName())
	start := time.Now()

	endpoint := "https://ads.moloco.com/rtb/bid"
	if ep, ok := req.Metadata["test_endpoint"]; ok && ep != "" {
		endpoint = ep
	}

	payload := map[string]any{
		"seat_id":   m.seatID,
		"api_key":   m.apiKey,
		"placement": req.PlacementID,
		"ad_type":   req.AdType,
		"bundle":    req.AppID,
		"ua":        req.DeviceInfo.UserAgent,
		"ip":        req.DeviceInfo.IP,
		"lmt":       req.UserInfo.LimitAdTracking,
		"floor":     req.FloorCPM,
	}
	body, _ := json.Marshal(payload)

	var molocoResp map[string]any
	operation := func() error {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", m.apiKey))

		resp, err := m.client.Do(httpReq)
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusNoContent {
			return fmt.Errorf("%s", NoBidNoFill)
		}
		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("status_%d", resp.StatusCode)
		}
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return err
		}
		return json.Unmarshal(data, &molocoResp)
	}

	if err := DoWithRetry(ctx, operation); err != nil {
		m.cb.OnFailure()
		reason := MapErrorToNoBid(err)
		observeLatency(m.GetName(), float64(time.Since(start).Milliseconds()))
		recordError(m.GetName(), reason)
		span.SetAttr("outcome", "no_bid")
		span.SetAttr("reason", reason)
		return &BidResponse{RequestID: req.RequestID, AdapterName: m.GetName(), NoBid: true, NoBidReason: reason}, nil
	}

	m.cb.OnSuccess()
	observeLatency(m.GetName(), float64(time.Since(start).Milliseconds()))
	recordSuccess(m.GetName())
	span.SetAttr("outcome", "success")

	bid, ok := molocoResp["bid"].(map[string]any)
	if !ok {
		recordError(m.GetName(), NoBidError)
		return &BidResponse{RequestID: req.RequestID, AdapterName: m.GetName(), NoBid: true, NoBidReason: NoBidError}, nil
	}
	cpm, _ := bid["price"].(float64)
	creative := fmt.Sprintf("%v", bid["markup"])

	return &BidResponse{
		BidID:       fmt.Sprintf("%s-%s", req.RequestID, m.GetName()),
		RequestID:   req.RequestID,
		AdapterName: m.GetName(),
		CPM:         cpm,
		Currency:    "USD",
		CreativeID:  fmt.Sprintf("%v", bid["creative_id"]),
		AdMarkup:    creative,
		ReceivedAt:  time.Now(),
	}, nil
}
