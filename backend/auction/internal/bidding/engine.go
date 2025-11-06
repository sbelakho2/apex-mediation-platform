package bidding

import (
	"context"
	"fmt"
	"math"
	"sort"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	log "github.com/sirupsen/logrus"

	"github.com/rivalapexmediation/auction/internal/bidders"
)

// AuctionType represents the type of auction
type AuctionType string

const (
	FirstPrice    AuctionType = "first_price"
	SecondPrice   AuctionType = "second_price"
	HeaderBidding AuctionType = "header_bidding"
	Waterfall     AuctionType = "waterfall"
	Hybrid        AuctionType = "hybrid" // S2S + header bidding + waterfall
)

// BidRequest represents an ad request
type BidRequest struct {
	RequestID   string            `json:"request_id"`
	AppID       string            `json:"app_id"`
	PlacementID string            `json:"placement_id"`
	AdType      string            `json:"ad_type"`
	DeviceInfo  DeviceInfo        `json:"device_info"`
	UserInfo    UserInfo          `json:"user_info"`
	FloorCPM    float64           `json:"floor_cpm"`
	TimeoutMS   int               `json:"timeout_ms"`
	AuctionType AuctionType       `json:"auction_type"`
	Adapters    []string          `json:"adapters"`
	Metadata    map[string]string `json:"metadata"`
}

// DeviceInfo contains device information
type DeviceInfo struct {
	OS             string `json:"os"`
	OSVersion      string `json:"os_version"`
	Make           string `json:"make"`
	Model          string `json:"model"`
	ScreenWidth    int    `json:"screen_width"`
	ScreenHeight   int    `json:"screen_height"`
	Language       string `json:"language"`
	TimeZone       string `json:"timezone"`
	ConnectionType string `json:"connection_type"`
	IP             string `json:"ip"`
	UserAgent      string `json:"user_agent"`
}

// UserInfo contains user information (privacy-compliant)
type UserInfo struct {
	AdvertisingID   string `json:"advertising_id"`
	LimitAdTracking bool   `json:"limit_ad_tracking"`
	ConsentString   string `json:"consent_string"` // GDPR/CCPA
}

// BidResponse represents a bid from an adapter
type BidResponse struct {
	BidID       string            `json:"bid_id"`
	RequestID   string            `json:"request_id"`
	AdapterName string            `json:"adapter_name"`
	CPM         float64           `json:"cpm"`
	Currency    string            `json:"currency"`
	CreativeID  string            `json:"creative_id"`
	AdMarkup    string            `json:"ad_markup"`
	Width       int               `json:"width"`
	Height      int               `json:"height"`
	Metadata    map[string]string `json:"metadata"`
	ReceivedAt  time.Time         `json:"received_at"`
}

// AuctionResult represents the auction outcome
type AuctionResult struct {
	RequestID    string        `json:"request_id"`
	Winner       *BidResponse  `json:"winner"`
	AllBids      []BidResponse `json:"all_bids"`
	AuctionType  AuctionType   `json:"auction_type"`
	Duration     time.Duration `json:"duration"`
	NoFill       bool          `json:"no_fill"`
	ErrorMessage string        `json:"error_message,omitempty"`
}

// AuctionEngine handles ad auctions
type AuctionEngine struct {
	redis *redis.Client
	mu    sync.RWMutex

	// internal knobs
	hedgingEnabled bool
	hedgeDelay     time.Duration
	requester      func(ctx context.Context, req BidRequest, adapterName string) (*BidResponse, error)
}

// NewAuctionEngine creates a new auction engine
func NewAuctionEngine(redisClient *redis.Client) *AuctionEngine {
	return &AuctionEngine{
		redis:    redisClient,
		hedgeDelay: 0,
		requester: defaultRequester,
	}
}

// SetHedgingEnabled enables or disables hedged adapter requests.
func (ae *AuctionEngine) SetHedgingEnabled(enabled bool) { ae.mu.Lock(); ae.hedgingEnabled = enabled; ae.mu.Unlock() }

// SetHedgeDelay sets a fixed hedge delay. If zero, the engine may decide based on metrics.
func (ae *AuctionEngine) SetHedgeDelay(d time.Duration) { ae.mu.Lock(); ae.hedgeDelay = d; ae.mu.Unlock() }

// SetRequester allows tests to inject a custom requester implementation.
func (ae *AuctionEngine) SetRequester(f func(ctx context.Context, req BidRequest, adapterName string) (*BidResponse, error)) {
	ae.mu.Lock(); ae.requester = f; ae.mu.Unlock()
}

// defaultRequester simulates an adapter call (placeholder for real integration).
func defaultRequester(ctx context.Context, req BidRequest, adapterName string) (*BidResponse, error) {
	// Simulate adapter latency 100ms
	select {
	case <-time.After(100 * time.Millisecond):
	case <-ctx.Done():
		return nil, fmt.Errorf("adapter timeout")
	}
	return &BidResponse{
		BidID:       fmt.Sprintf("%s-%s", req.RequestID, adapterName),
		RequestID:   req.RequestID,
		AdapterName: adapterName,
		CPM:         2.50 + float64(len(adapterName))*0.1,
		Currency:    "USD",
		CreativeID:  "creative-123",
		AdMarkup:    "<html>Ad</html>",
		ReceivedAt:  time.Now(),
	}, nil
}

// RunAuction executes an auction
func (ae *AuctionEngine) RunAuction(ctx context.Context, req BidRequest) (*AuctionResult, error) {
	startTime := time.Now()

	result := &AuctionResult{
		RequestID:   req.RequestID,
		AuctionType: req.AuctionType,
		AllBids:     []BidResponse{},
		NoFill:      true,
	}

	// Set timeout
	auctionCtx, cancel := context.WithTimeout(ctx, time.Duration(req.TimeoutMS)*time.Millisecond)
	defer cancel()

	// Collect bids based on auction type
	var bids []BidResponse
	var err error

	switch req.AuctionType {
	case HeaderBidding:
		bids, err = ae.runHeaderBidding(auctionCtx, req)
	case Waterfall:
		bids, err = ae.runWaterfall(auctionCtx, req)
	case Hybrid:
		bids, err = ae.runHybridAuction(auctionCtx, req)
	default:
		bids, err = ae.runUnifiedFirstPrice(auctionCtx, req)
	}

	if err != nil {
		result.ErrorMessage = err.Error()
		result.Duration = time.Since(startTime)
		return result, err
	}

	result.AllBids = bids

	// Apply floor price filtering
	filteredBids := ae.applyFloorPrice(bids, req.FloorCPM)

	if len(filteredBids) == 0 {
		result.NoFill = true
		result.Duration = time.Since(startTime)
		return result, nil
	}

	// Normalize CPM (convert to USD)
	normalizedBids := ae.normalizeCPM(filteredBids)

	// Select winner
	winner := ae.selectWinner(normalizedBids, req.AuctionType)
	result.Winner = &winner
	result.NoFill = false
	result.Duration = time.Since(startTime)

	log.WithFields(log.Fields{
		"request_id": req.RequestID,
		"winner":     winner.AdapterName,
		"cpm":        winner.CPM,
		"duration":   result.Duration,
	}).Info("Auction completed")

	return result, nil
}

// runUnifiedFirstPrice runs a unified first-price auction
func (ae *AuctionEngine) runUnifiedFirstPrice(ctx context.Context, req BidRequest) ([]BidResponse, error) {
	bidsChan := make(chan BidResponse, len(req.Adapters))
	var wg sync.WaitGroup

	// Request bids from all adapters in parallel
	for _, adapter := range req.Adapters {
		wg.Add(1)
		go func(adapterName string) {
			defer wg.Done()

			bid, err := ae.requestBidFromAdapter(ctx, req, adapterName)
			if err != nil {
				log.WithFields(log.Fields{
					"adapter": adapterName,
					"error":   err,
				}).Warn("Adapter bid failed")
				return
			}

			select {
			case bidsChan <- *bid:
			case <-ctx.Done():
				return
			}
		}(adapter)
	}

	// Wait for all adapters (or timeout)
	go func() {
		wg.Wait()
		close(bidsChan)
	}()

	// Collect bids
	var bids []BidResponse
	for bid := range bidsChan {
		bids = append(bids, bid)
	}

	return bids, nil
}

// runHeaderBidding runs header bidding auction
func (ae *AuctionEngine) runHeaderBidding(ctx context.Context, req BidRequest) ([]BidResponse, error) {
	// Similar to unified first-price but with S2S bid collection
	return ae.runUnifiedFirstPrice(ctx, req)
}

// runWaterfall runs waterfall mediation
func (ae *AuctionEngine) runWaterfall(ctx context.Context, req BidRequest) ([]BidResponse, error) {
	// Try adapters sequentially in priority order
	for _, adapter := range req.Adapters {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("waterfall timeout")
		default:
			bid, err := ae.requestBidFromAdapter(ctx, req, adapter)
			if err != nil {
				log.WithFields(log.Fields{
					"adapter": adapter,
					"error":   err,
				}).Warn("Waterfall adapter failed")
				continue
			}

			// Return first successful bid
			if bid.CPM >= req.FloorCPM {
				return []BidResponse{*bid}, nil
			}
		}
	}

	return []BidResponse{}, nil
}

// runHybridAuction runs hybrid auction (S2S + header bidding + waterfall fallback)
func (ae *AuctionEngine) runHybridAuction(ctx context.Context, req BidRequest) ([]BidResponse, error) {
	// Phase 1: Parallel header bidding
	headerBids, _ := ae.runHeaderBidding(ctx, req)

	// Phase 2: If no fill, run waterfall
	if len(headerBids) == 0 {
		return ae.runWaterfall(ctx, req)
	}

	return headerBids, nil
}

// requestBidFromAdapter requests a bid from a specific adapter
func (ae *AuctionEngine) requestBidFromAdapter(ctx context.Context, req BidRequest, adapterName string) (*BidResponse, error) {
	// If hedging disabled, single request path using requester
	if !ae.hedgingEnabled {
		return ae.requester(ctx, req, adapterName)
	}

	// Hedged path: launch primary request; after a delay, launch a single backup if still pending.
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	resCh := make(chan *BidResponse, 1)
	errCh := make(chan error, 2)

	launch := func() {
		bid, err := ae.requester(ctx, req, adapterName)
		if err != nil {
			select { case errCh <- err: default: }
			return
		}
		select {
		case resCh <- bid:
			// winner delivered
			cancel()
		default:
		}
	}

	// Start primary
	go launch()

	// Compute hedge delay
	delay := ae.hedgeDelay
	if delay <= 0 {
		// Use adapter p95 if available
		_, p95, _ := bidders.GetAdapterPercentiles(adapterName)
		if p95 > 0 {
			delay = time.Duration(p95) * time.Millisecond
		} else {
			// fallback conservative delay
			delay = 150 * time.Millisecond
		}
	}

	// Respect remaining ctx deadline
	if deadline, ok := ctx.Deadline(); ok {
		rem := time.Until(deadline)
		if delay > rem/2 && rem > 0 {
			// ensure hedge has a chance to finish before deadline
			delay = rem / 2
			if delay < 10*time.Millisecond { delay = 10 * time.Millisecond }
		}
	}

	t := time.NewTimer(delay)
	defer t.Stop()

	launchedHedge := false
	for {
		select {
		case bid := <-resCh:
			return bid, nil
		case <-t.C:
			if !launchedHedge {
				launchedHedge = true
				go launch()
			}
		case <-ctx.Done():
			// If any error captured, prefer first error
			select {
			case err := <-errCh:
				return nil, err
			default:
				return nil, fmt.Errorf("adapter timeout")
			}
		}
	}
}

// applyFloorPrice filters bids below floor price
func (ae *AuctionEngine) applyFloorPrice(bids []BidResponse, floorCPM float64) []BidResponse {
	filtered := []BidResponse{}
	for _, bid := range bids {
		if bid.CPM >= floorCPM {
			filtered = append(filtered, bid)
		}
	}
	return filtered
}

// normalizeCPM converts all bids to USD
func (ae *AuctionEngine) normalizeCPM(bids []BidResponse) []BidResponse {
	// Exchange rates (in production, fetch from external service)
	exchangeRates := map[string]float64{
		"USD": 1.0,
		"EUR": 1.08,
		"GBP": 1.27,
		"JPY": 0.0067,
	}

	normalized := make([]BidResponse, len(bids))
	for i, bid := range bids {
		rate, ok := exchangeRates[bid.Currency]
		if !ok {
			rate = 1.0 // Default to USD
		}

		normalized[i] = bid
		normalized[i].CPM = bid.CPM * rate
		normalized[i].Currency = "USD"
	}

	return normalized
}

// selectWinner selects the auction winner
func (ae *AuctionEngine) selectWinner(bids []BidResponse, auctionType AuctionType) BidResponse {
	if len(bids) == 0 {
		return BidResponse{}
	}

	// Sort bids by CPM descending
	sort.Slice(bids, func(i, j int) bool {
		return bids[i].CPM > bids[j].CPM
	})

	switch auctionType {
	case SecondPrice:
		// Winner pays second-highest price + $0.01
		winner := bids[0]
		if len(bids) > 1 {
			winner.CPM = math.Min(bids[1].CPM+0.01, winner.CPM)
		}
		return winner
	default:
		// First price - winner pays their bid
		return bids[0]
	}
}
