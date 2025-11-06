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

// MetaAdapter implements bidding for Meta Audience Network
type MetaAdapter struct {
	appID     string
	appSecret string
	client    *http.Client

	// circuit breaker (shared, clock-enabled)
	cb *CircuitBreaker
}

// MetaBidRequest represents a bid request to Meta
type MetaBidRequest struct {
	PlacementID string          `json:"placement_id"`
	TestMode    bool            `json:"test_mode"`
	Device      MetaDevice      `json:"device"`
	User        MetaUser        `json:"user"`
	App         MetaApp         `json:"app"`
	AdFormat    string          `json:"ad_format"` // banner, interstitial, rewarded_video, native
	FloorPrice  float64         `json:"floor_price,omitempty"`
}

type MetaDevice struct {
	Platform       string  `json:"platform"` // ios, android
	PlatformVersion string `json:"platform_version"`
	Manufacturer   string  `json:"manufacturer"`
	Model          string  `json:"model"`
	IP             string  `json:"ip"`
	UserAgent      string  `json:"user_agent"`
	Language       string  `json:"language"`
	AdvertisingID  string  `json:"advertising_id"` // IDFA/GAID
	DNT            bool    `json:"dnt"`
	ScreenWidth    int     `json:"screen_width"`
	ScreenHeight   int     `json:"screen_height"`
	ConnectionType string  `json:"connection_type"` // wifi, cellular
}

type MetaUser struct {
	ID            string `json:"id,omitempty"`
	Gender        string `json:"gender,omitempty"` // m, f
	YearOfBirth   int    `json:"year_of_birth,omitempty"`
	ConsentStatus string `json:"consent_status,omitempty"` // gdpr_consent_obtained, ccpa_opted_out
}

type MetaApp struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Bundle   string `json:"bundle"`
	StoreURL string `json:"store_url"`
}

// MetaBidResponse represents a bid response from Meta
type MetaBidResponse struct {
	Success       bool    `json:"success"`
	PlacementID   string  `json:"placement_id"`
	BidID         string  `json:"bid_id"`
	BidPrice      float64 `json:"bid_price"` // CPM in USD
	Currency      string  `json:"currency"`
	CreativeID    string  `json:"creative_id"`
	AdMarkup      string  `json:"ad_markup"` // HTML or JSON
	Width         int     `json:"width,omitempty"`
	Height        int     `json:"height,omitempty"`
	CampaignID    string  `json:"campaign_id,omitempty"`
	ImpressionURL string  `json:"impression_url"`
	ClickURL      string  `json:"click_url"`
	ErrorMessage  string  `json:"error_message,omitempty"`
	ErrorCode     string  `json:"error_code,omitempty"`
}

// NewMetaAdapter creates a new Meta Audience Network adapter
func NewMetaAdapter(appID, appSecret string) *MetaAdapter {
	return &MetaAdapter{
		appID:     appID,
		appSecret: appSecret,
		client: &http.Client{
			Timeout: 5 * time.Second,
		},
		cb: NewCircuitBreaker(3, 30*time.Second),
	}
}

// RequestBid requests a bid from Meta Audience Network
func (m *MetaAdapter) RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error) {
	// Tracing span
	ctx, span := StartSpan(ctx, "adapter.request", map[string]string{"adapter": "meta"})
	defer span.End()
	// Circuit breaker: fail fast if open
	if m.isCircuitOpen() {
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "meta",
			NoBid:       true,
			NoBidReason: "circuit_open",
		}, nil
	}

	recordRequest("meta")
	startTime := time.Now()

	metaReq := m.convertToMetaRequest(req)

	var bidResponse *MetaBidResponse
	operation := func() error {
		// Default endpoint constructed from placement ID
		endpoint := fmt.Sprintf("https://graph.facebook.com/v18.0/%s/bidding", metaReq.PlacementID)
		// Test override for offline conformance
		if ep, ok := req.Metadata["test_endpoint"]; ok && ep != "" {
			endpoint = ep
		}
		resp, err := m.sendBidRequestToURL(ctx, metaReq, endpoint)
		if err != nil {
			return err
		}
		bidResponse = resp
		return nil
	}

		err := DoWithRetry(ctx, operation)
	if err != nil {
		m.onFailure()
		reason := MapErrorToNoBid(err)
		observeLatency("meta", float64(time.Since(startTime).Milliseconds()))
		if reason == NoBidNoFill {
			recordNoFill("meta")
		} else if reason == NoBidTimeout {
			recordTimeout("meta")
		} else {
			recordError("meta", reason)
		}
		span.SetAttr("outcome", "no_bid")
		span.SetAttr("reason", reason)
		log.WithError(err).Error("Meta bid request failed after retries")
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "meta",
			NoBid:       true,
			NoBidReason: reason,
		}, nil
	}

	m.onSuccess()

	// Convert Meta response to generic format
	genericResponse := m.convertToGenericResponse(bidResponse, req)
	observeLatency("meta", float64(time.Since(startTime).Milliseconds()))
	if genericResponse.NoBid {
		if genericResponse.NoBidReason == NoBidNoFill {
			recordNoFill("meta")
		} else if genericResponse.NoBidReason == NoBidTimeout {
			recordTimeout("meta")
		} else {
			recordError("meta", genericResponse.NoBidReason)
		}
		span.SetAttr("outcome", "no_bid")
		span.SetAttr("reason", genericResponse.NoBidReason)
		CaptureDebugEvent(DebugEvent{
			PlacementID: req.PlacementID,
			RequestID:   req.RequestID,
			Adapter:     "meta",
			Outcome:     "no_bid",
			Reason:      genericResponse.NoBidReason,
			TimingsMS:   map[string]float64{"total": float64(time.Since(startTime).Milliseconds())},
			RespSummary: map[string]any{"error_code": genericResponse.Metadata["error_code"]},
		})
	} else {
		recordSuccess("meta")
		span.SetAttr("outcome", "success")
		CaptureDebugEvent(DebugEvent{
			PlacementID: req.PlacementID,
			RequestID:   req.RequestID,
			Adapter:     "meta",
			Outcome:     "success",
			TimingsMS:   map[string]float64{"total": float64(time.Since(startTime).Milliseconds())},
		})
	}
	return genericResponse, nil
}

// convertToMetaRequest converts generic bid request to Meta format
func (m *MetaAdapter) convertToMetaRequest(req BidRequest) MetaBidRequest {
	testMode := req.Metadata["test_mode"] == "true"

	consentStatus := ""
	if req.UserInfo.ConsentString != "" {
		consentStatus = "gdpr_consent_obtained"
	}
	if req.UserInfo.LimitAdTracking {
		consentStatus = "ccpa_opted_out"
	}

	return MetaBidRequest{
		PlacementID: req.Metadata["meta_placement_id"],
		TestMode:    testMode,
		Device: MetaDevice{
			Platform:       req.DeviceInfo.OS,
			PlatformVersion: req.DeviceInfo.OSVersion,
			Manufacturer:   req.DeviceInfo.Make,
			Model:          req.DeviceInfo.Model,
			IP:             req.DeviceInfo.IP,
			UserAgent:      req.DeviceInfo.UserAgent,
			Language:       req.DeviceInfo.Language,
			AdvertisingID:  req.UserInfo.AdvertisingID,
			DNT:            req.UserInfo.LimitAdTracking,
			ScreenWidth:    req.DeviceInfo.ScreenWidth,
			ScreenHeight:   req.DeviceInfo.ScreenHeight,
			ConnectionType: req.DeviceInfo.ConnectionType,
		},
		User: MetaUser{
			ID:            req.UserInfo.AdvertisingID,
			ConsentStatus: consentStatus,
		},
		App: MetaApp{
			ID:       m.appID,
			Name:     req.Metadata["app_name"],
			Bundle:   req.AppID,
			StoreURL: req.Metadata["store_url"],
		},
		AdFormat:   m.convertAdFormat(req.AdType),
		FloorPrice: req.FloorCPM,
	}
}

// sendBidRequest sends HTTP request to Meta (default endpoint)
func (m *MetaAdapter) sendBidRequest(ctx context.Context, req MetaBidRequest) (*MetaBidResponse, error) {
	endpoint := fmt.Sprintf("https://graph.facebook.com/v18.0/%s/bidding", req.PlacementID)
	return m.sendBidRequestToURL(ctx, req, endpoint)
}

// sendBidRequestToURL sends HTTP request to Meta using a specific endpoint (for tests)
func (m *MetaAdapter) sendBidRequestToURL(ctx context.Context, req MetaBidRequest, endpoint string) (*MetaBidResponse, error) {
	// Serialize request
	reqBody, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("User-Agent", "ApexMediation-Mediation/1.0")

	// Add authentication (if calling real endpoint)
	if httpReq.URL.Host != "" {
		q := httpReq.URL.Query()
		q.Add("access_token", fmt.Sprintf("%s|%s", m.appID, m.appSecret))
		httpReq.URL.RawQuery = q.Encode()
	}

	// Send request
	startTime := time.Now()
	resp, err := m.client.Do(httpReq)
	latency := time.Since(startTime)

	if err != nil {
		log.WithError(err).WithField("latency_ms", latency.Milliseconds()).Error("Meta HTTP request failed")
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check status code and map
	if resp.StatusCode == http.StatusNoContent {
		return nil, fmt.Errorf("no_fill")
	}
	if resp.StatusCode != http.StatusOK {
		log.WithFields(log.Fields{
			"status_code": resp.StatusCode,
			"response":    string(respBody),
		}).Error("Meta returned non-200 status")
		return nil, fmt.Errorf("status_%d", resp.StatusCode)
	}

	// Parse response
	var bidResp MetaBidResponse
	if err := json.Unmarshal(respBody, &bidResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	log.WithFields(log.Fields{
		"placement_id": req.PlacementID,
		"latency_ms":   latency.Milliseconds(),
		"success":      bidResp.Success,
		"bid_price":    bidResp.BidPrice,
	}).Info("Meta bid response received")

	return &bidResp, nil
}

// convertToGenericResponse converts Meta response to generic format
func (m *MetaAdapter) convertToGenericResponse(resp *MetaBidResponse, req BidRequest) *BidResponse {
	// Check if bid was successful
	if !resp.Success {
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "meta",
			CPM:         0,
			NoBid:       true,
			NoBidReason: "error",
			Metadata: map[string]string{
				"error_code":    resp.ErrorCode,
				"error_message": resp.ErrorMessage,
			},
		}
	}

	// Check if bid meets floor price
	if resp.BidPrice < req.FloorCPM {
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "meta",
			CPM:         resp.BidPrice,
			NoBid:       true,
			NoBidReason: "below_floor",
		}
	}

	return &BidResponse{
		BidID:       resp.BidID,
		RequestID:   req.RequestID,
		AdapterName: "meta",
		CPM:         resp.BidPrice,
		Currency:    resp.Currency,
		CreativeID:  resp.CreativeID,
		AdMarkup:    resp.AdMarkup,
		Width:       resp.Width,
		Height:      resp.Height,
		Metadata: map[string]string{
			"campaign_id":     resp.CampaignID,
			"impression_url":  resp.ImpressionURL,
			"click_url":       resp.ClickURL,
			"placement_id":    resp.PlacementID,
		},
		ReceivedAt: time.Now(),
	}
}

// convertAdFormat converts generic ad format to Meta format
func (m *MetaAdapter) convertAdFormat(format string) string {
	switch format {
	case "banner":
		return "banner"
	case "interstitial":
		return "interstitial"
	case "rewarded":
		return "rewarded_video"
	case "native":
		return "native"
	default:
		return "banner"
	}
}

// GetName returns adapter name
func (m *MetaAdapter) GetName() string {
	return "meta"
}

// GetTimeout returns adapter timeout
func (m *MetaAdapter) GetTimeout() time.Duration {
	return 5 * time.Second
}

// --- minimal resiliency helpers (retry + jitter + circuit breaker) ---

func (m *MetaAdapter) isCircuitOpen() bool {
	if m.cb == nil {
		return false
	}
	return !m.cb.Allow()
}

func (m *MetaAdapter) onFailure() {
	if m.cb != nil {
		m.cb.OnFailure()
	}
}

func (m *MetaAdapter) onSuccess() {
	if m.cb != nil {
		m.cb.OnSuccess()
	}
}
