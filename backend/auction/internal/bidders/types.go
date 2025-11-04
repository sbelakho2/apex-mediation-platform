package bidders

import (
	"context"
	"time"
)

// BidRequest represents a generic bid request
type BidRequest struct {
	RequestID   string
	AppID       string
	PlacementID string
	AdType      string // banner, interstitial, rewarded, native
	DeviceInfo  DeviceInfo
	UserInfo    UserInfo
	FloorCPM    float64
	TimeoutMS   int
	Metadata    map[string]string
}

// DeviceInfo contains device information
type DeviceInfo struct {
	OS             string
	OSVersion      string
	Make           string
	Model          string
	ScreenWidth    int
	ScreenHeight   int
	Language       string
	TimeZone       string
	ConnectionType string
	IP             string
	UserAgent      string
}

// UserInfo contains user information
type UserInfo struct {
	AdvertisingID   string
	LimitAdTracking bool
	ConsentString   string // GDPR/CCPA consent
}

// BidResponse represents a generic bid response
type BidResponse struct {
	BidID       string
	RequestID   string
	AdapterName string
	CPM         float64
	Currency    string
	CreativeID  string
	AdMarkup    string
	Width       int
	Height      int
	Metadata    map[string]string
	ReceivedAt  time.Time
	NoBid       bool
	NoBidReason string
}

// Bidder interface that all adapters must implement
type Bidder interface {
	// RequestBid requests a bid from the ad network
	RequestBid(ctx context.Context, req BidRequest) (*BidResponse, error)

	// GetName returns the adapter name
	GetName() string

	// GetTimeout returns the adapter timeout
	GetTimeout() time.Duration
}
