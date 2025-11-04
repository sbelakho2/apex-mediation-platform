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

// AdMobAdapter implements bidding for Google AdMob
type AdMobAdapter struct {
	apiKey      string
	publisherID string
	client      *http.Client
}

// AdMobBidRequest represents a bid request to AdMob
type AdMobBidRequest struct {
	RequestID   string                 `json:"request_id"`
	App         AdMobApp               `json:"app"`
	Device      AdMobDevice            `json:"device"`
	User        AdMobUser              `json:"user"`
	AdUnit      AdMobAdUnit            `json:"ad_unit"`
	Regs        AdMobRegs              `json:"regs"`
	Ext         map[string]interface{} `json:"ext,omitempty"`
	Test        int                    `json:"test"` // 1 for test mode
	TimeoutMS   int                    `json:"tmax"`
}

type AdMobApp struct {
	ID        string `json:"id"`         // AdMob App ID
	Name      string `json:"name"`
	Bundle    string `json:"bundle"`     // Bundle ID (com.example.app)
	StoreURL  string `json:"storeurl"`   // App store URL
	Domain    string `json:"domain"`
	Publisher AdMobPublisher `json:"publisher"`
}

type AdMobPublisher struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type AdMobDevice struct {
	UA           string  `json:"ua"`            // User agent
	Geo          AdMobGeo `json:"geo"`
	IP           string  `json:"ip"`
	DeviceType   int     `json:"devicetype"`    // 1=Mobile, 2=Tablet, 3=Connected TV
	Make         string  `json:"make"`          // Apple, Samsung
	Model        string  `json:"model"`         // iPhone15,2
	OS           string  `json:"os"`            // iOS, Android
	OSV          string  `json:"osv"`           // 17.1
	Language     string  `json:"language"`      // en
	IFA          string  `json:"ifa"`           // IDFA/GAID
	DNT          int     `json:"dnt"`           // 0=tracking allowed, 1=do not track
	LMT          int     `json:"lmt"`           // Limit ad tracking
	ConnectionType int   `json:"connectiontype"` // 1=Ethernet, 2=WiFi, 3=Cellular
}

type AdMobGeo struct {
	Lat     float64 `json:"lat,omitempty"`
	Lon     float64 `json:"lon,omitempty"`
	Country string  `json:"country"` // ISO-3166-1-alpha-2
	Region  string  `json:"region,omitempty"`
	City    string  `json:"city,omitempty"`
	ZIP     string  `json:"zip,omitempty"`
	Type    int     `json:"type"` // 1=GPS, 2=IP, 3=User
}

type AdMobUser struct {
	ID        string `json:"id,omitempty"` // User ID (hashed)
	YOB       int    `json:"yob,omitempty"` // Year of birth
	Gender    string `json:"gender,omitempty"` // M, F, O
	Consent   string `json:"consent,omitempty"` // IAB consent string
}

type AdMobAdUnit struct {
	ID     string `json:"id"`     // AdMob Ad Unit ID
	Format string `json:"format"` // banner, interstitial, rewarded, native
	Width  int    `json:"w,omitempty"`
	Height int    `json:"h,omitempty"`
}

type AdMobRegs struct {
	COPPA int `json:"coppa"` // 1=subject to COPPA
	GDPR  int `json:"gdpr"`  // 1=subject to GDPR
}

// AdMobBidResponse represents a bid response from AdMob
type AdMobBidResponse struct {
	ID         string       `json:"id"`
	SeatBid    []AdMobSeatBid `json:"seatbid"`
	BidID      string       `json:"bidid"`
	Currency   string       `json:"cur"`
	NBR        int          `json:"nbr,omitempty"` // No bid reason
}

type AdMobSeatBid struct {
	Bid []AdMobBid `json:"bid"`
	Seat string `json:"seat,omitempty"`
}

type AdMobBid struct {
	ID        string  `json:"id"`
	ImpID     string  `json:"impid"`
	Price     float64 `json:"price"` // CPM in USD
	AdID      string  `json:"adid"`
	NURL      string  `json:"nurl,omitempty"` // Win notice URL
	AdMarkup  string  `json:"adm"`            // Ad markup (HTML/VAST)
	AdvDomain []string `json:"adomain,omitempty"`
	CID       string  `json:"cid,omitempty"` // Campaign ID
	CRType    string  `json:"crtype"`        // Creative type
	Width     int     `json:"w,omitempty"`
	Height    int     `json:"h,omitempty"`
}

// NewAdMobAdapter creates a new AdMob adapter
func NewAdMobAdapter(apiKey, publisherID string) *AdMobAdapter {
	return &AdMobAdapter{
		apiKey:      apiKey,
		publisherID: publisherID,
		client: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// RequestBid requests a bid from AdMob
func (a *AdMobAdapter) RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error) {
	// Convert generic bid request to AdMob format
	admobReq := a.convertToAdMobRequest(req)

	// Make HTTP request to AdMob
	bidResponse, err := a.sendBidRequest(ctx, admobReq)
	if err != nil {
		log.WithError(err).Error("AdMob bid request failed")
		return nil, err
	}

	// Convert AdMob response to generic format
	genericResponse := a.convertToGenericResponse(bidResponse, req)

	return genericResponse, nil
}

// convertToAdMobRequest converts generic bid request to AdMob format
func (a *AdMobAdapter) convertToAdMobRequest(req BidRequest) AdMobBidRequest {
	deviceType := 1 // Mobile by default
	if req.DeviceInfo.Make == "tablet" {
		deviceType = 2
	}

	dnt := 0
	lmt := 0
	if req.UserInfo.LimitAdTracking {
		dnt = 1
		lmt = 1
	}

	connectionType := 2 // WiFi default
	if req.DeviceInfo.ConnectionType == "cellular" {
		connectionType = 3
	}

	test := 0
	if req.Metadata["test_mode"] == "true" {
		test = 1
	}

	return AdMobBidRequest{
		RequestID: req.RequestID,
		App: AdMobApp{
			ID:       req.Metadata["admob_app_id"],
			Name:     req.Metadata["app_name"],
			Bundle:   req.AppID,
			StoreURL: req.Metadata["store_url"],
			Publisher: AdMobPublisher{
				ID:   a.publisherID,
				Name: req.Metadata["publisher_name"],
			},
		},
		Device: AdMobDevice{
			UA:             req.DeviceInfo.UserAgent,
			IP:             req.DeviceInfo.IP,
			DeviceType:     deviceType,
			Make:           req.DeviceInfo.Make,
			Model:          req.DeviceInfo.Model,
			OS:             req.DeviceInfo.OS,
			OSV:            req.DeviceInfo.OSVersion,
			Language:       req.DeviceInfo.Language,
			IFA:            req.UserInfo.AdvertisingID,
			DNT:            dnt,
			LMT:            lmt,
			ConnectionType: connectionType,
			Geo: AdMobGeo{
				Country: req.Metadata["country_code"],
				Type:    2, // IP-based geolocation
			},
		},
		User: AdMobUser{
			ID:      req.UserInfo.AdvertisingID, // Hashed
			Consent: req.UserInfo.ConsentString,
		},
		AdUnit: AdMobAdUnit{
			ID:     req.Metadata["admob_ad_unit_id"],
			Format: req.AdType,
			Width:  req.DeviceInfo.ScreenWidth,
			Height: req.DeviceInfo.ScreenHeight,
		},
		Regs: AdMobRegs{
			COPPA: 0, // Assume not COPPA unless specified
			GDPR:  a.isGDPR(req.UserInfo.ConsentString),
		},
		Test:      test,
		TimeoutMS: req.TimeoutMS,
	}
}

// sendBidRequest sends HTTP request to AdMob
func (a *AdMobAdapter) sendBidRequest(ctx context.Context, req AdMobBidRequest) (*AdMobBidResponse, error) {
	// AdMob RTB endpoint
	endpoint := "https://googleads.g.doubleclick.net/mads/static/mad/sdk/native/production/ads"

	// Serialize request
	reqBody, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("User-Agent", "ApexMediation-Mediation/1.0")
	httpReq.Header.Set("X-Admob-Request-Agent", "ApexMediation-SDK/1.0")
	httpReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", a.apiKey))

	// Set body
	httpReq.Body = io.NopCloser(bytes.NewReader(reqBody))

	// Send request
	startTime := time.Now()
	resp, err := a.client.Do(httpReq)
	latency := time.Since(startTime)

	if err != nil {
		log.WithError(err).WithField("latency_ms", latency.Milliseconds()).Error("AdMob HTTP request failed")
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check status code
	if resp.StatusCode != http.StatusOK {
		log.WithFields(log.Fields{
			"status_code": resp.StatusCode,
			"response":    string(respBody),
		}).Error("AdMob returned non-200 status")
		return nil, fmt.Errorf("AdMob returned status %d", resp.StatusCode)
	}

	// Parse response
	var bidResp AdMobBidResponse
	if err := json.Unmarshal(respBody, &bidResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	log.WithFields(log.Fields{
		"request_id":  req.RequestID,
		"latency_ms":  latency.Milliseconds(),
		"num_bids":    len(bidResp.SeatBid),
		"currency":    bidResp.Currency,
	}).Info("AdMob bid response received")

	return &bidResp, nil
}

// convertToGenericResponse converts AdMob response to generic format
func (a *AdMobAdapter) convertToGenericResponse(resp *AdMobBidResponse, req BidRequest) *BidResponse {
	// Check if we have bids
	if len(resp.SeatBid) == 0 || len(resp.SeatBid[0].Bid) == 0 {
		return &BidResponse{
			RequestID:   req.RequestID,
			AdapterName: "admob",
			CPM:         0,
			NoBid:       true,
			NoBidReason: "no_fill",
		}
	}

	// Take first bid (highest CPM)
	bid := resp.SeatBid[0].Bid[0]

	return &BidResponse{
		BidID:       bid.ID,
		RequestID:   req.RequestID,
		AdapterName: "admob",
		CPM:         bid.Price,
		Currency:    resp.Currency,
		CreativeID:  bid.AdID,
		AdMarkup:    bid.AdMarkup,
		Width:       bid.Width,
		Height:      bid.Height,
		Metadata: map[string]string{
			"campaign_id":   bid.CID,
			"creative_type": bid.CRType,
			"win_notice":    bid.NURL,
		},
		ReceivedAt: time.Now(),
	}
}

// isGDPR checks if request is subject to GDPR
func (a *AdMobAdapter) isGDPR(consentString string) int {
	if consentString != "" {
		return 1 // Has consent string = GDPR applies
	}
	return 0
}

// GetName returns adapter name
func (a *AdMobAdapter) GetName() string {
	return "admob"
}

// GetTimeout returns adapter timeout
func (a *AdMobAdapter) GetTimeout() time.Duration {
	return 5 * time.Second
}
