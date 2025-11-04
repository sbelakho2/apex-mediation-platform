package fraud

import (
	"context"
	"fmt"
	"net"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	log "github.com/sirupsen/logrus"
)

// FraudType represents type of fraud detection
type FraudType string

const (
	GIVT FraudType = "givt" // General Invalid Traffic
	SIVT FraudType = "sivt" // Sophisticated Invalid Traffic
)

// FraudScore represents fraud detection result
type FraudScore struct {
	Score     float64           `json:"score"` // 0.0 (clean) to 1.0 (fraud)
	FraudType FraudType         `json:"fraud_type"`
	Reasons   []string          `json:"reasons"`
	Blocked   bool              `json:"blocked"`
	Metadata  map[string]string `json:"metadata"`
	CheckedAt time.Time         `json:"checked_at"`
}

// RequestData contains request information for fraud detection
type RequestData struct {
	IP            string
	UserAgent     string
	DeviceID      string
	AppID         string
	PlacementID   string
	AdvertisingID string
	Timestamp     time.Time
	ClickID       string
	SessionID     string
}

// FraudDetector implements fraud detection
type FraudDetector struct {
	redis              *redis.Client
	datacenterIPRanges []*net.IPNet
	knownBots          map[string]bool
	suspiciousPatterns []*regexp.Regexp
	mu                 sync.RWMutex

	// Thresholds
	scoreThreshold     float64
	clickRateThreshold float64

	// BlockList
	BlockList *BlockList
}

// NewFraudDetector creates a new fraud detector
func NewFraudDetector(redisClient *redis.Client) *FraudDetector {
	fd := &FraudDetector{
		redis:              redisClient,
		datacenterIPRanges: loadDatacenterIPRanges(),
		knownBots:          loadKnownBots(),
		suspiciousPatterns: loadSuspiciousPatterns(),
		scoreThreshold:     0.7,  // Block if score >= 0.7
		clickRateThreshold: 10.0, // Clicks per minute
		BlockList:          NewBlockList(redisClient),
	}

	return fd
}

// CheckRequest performs fraud detection on a request
func (fd *FraudDetector) CheckRequest(ctx context.Context, req RequestData) FraudScore {
	score := FraudScore{
		Score:     0.0,
		FraudType: GIVT,
		Reasons:   []string{},
		Metadata:  make(map[string]string),
		CheckedAt: time.Now(),
	}

	// GIVT Checks
	fd.checkDatacenterIP(req.IP, &score)
	fd.checkKnownBot(req.UserAgent, &score)
	fd.checkInvalidUserAgent(req.UserAgent, &score)
	fd.checkClickRate(ctx, req, &score)

	// SIVT Checks
	fd.checkDeviceFingerprint(ctx, req, &score)
	fd.checkClickPatterns(ctx, req, &score)
	fd.checkSessionBehavior(ctx, req, &score)

	// Determine if blocked
	score.Blocked = score.Score >= fd.scoreThreshold

	// Log high-risk requests
	if score.Score >= 0.5 {
		log.WithFields(log.Fields{
			"ip":      req.IP,
			"score":   score.Score,
			"reasons": score.Reasons,
			"blocked": score.Blocked,
		}).Warn("High fraud score detected")
	}

	return score
}

// GIVT Checks

// checkDatacenterIP checks if IP is from a datacenter
func (fd *FraudDetector) checkDatacenterIP(ipStr string, score *FraudScore) {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return
	}

	fd.mu.RLock()
	defer fd.mu.RUnlock()

	for _, ipNet := range fd.datacenterIPRanges {
		if ipNet.Contains(ip) {
			score.Score += 0.6
			score.Reasons = append(score.Reasons, "datacenter_ip")
			score.Metadata["ip_type"] = "datacenter"
			return
		}
	}
}

// checkKnownBot checks if user agent is a known bot
func (fd *FraudDetector) checkKnownBot(userAgent string, score *FraudScore) {
	userAgent = strings.ToLower(userAgent)

	fd.mu.RLock()
	defer fd.mu.RUnlock()

	for bot := range fd.knownBots {
		if strings.Contains(userAgent, bot) {
			score.Score += 0.8
			score.Reasons = append(score.Reasons, "known_bot")
			score.Metadata["bot_type"] = bot
			return
		}
	}
}

// checkInvalidUserAgent checks for suspicious user agent patterns
func (fd *FraudDetector) checkInvalidUserAgent(userAgent string, score *FraudScore) {
	// Empty user agent
	if userAgent == "" || userAgent == "-" {
		score.Score += 0.3
		score.Reasons = append(score.Reasons, "empty_user_agent")
		return
	}

	// Too short
	if len(userAgent) < 20 {
		score.Score += 0.2
		score.Reasons = append(score.Reasons, "short_user_agent")
	}

	// Check suspicious patterns
	fd.mu.RLock()
	defer fd.mu.RUnlock()

	for _, pattern := range fd.suspiciousPatterns {
		if pattern.MatchString(userAgent) {
			score.Score += 0.4
			score.Reasons = append(score.Reasons, "suspicious_user_agent_pattern")
			break
		}
	}
}

// checkClickRate checks for abnormal click rates
func (fd *FraudDetector) checkClickRate(ctx context.Context, req RequestData, score *FraudScore) {
	key := "click_rate:" + req.DeviceID

	// Increment click counter
	count, err := fd.redis.Incr(ctx, key).Result()
	if err != nil {
		log.WithError(err).Error("Failed to increment click counter")
		return
	}

	// Set expiry on first click
	if count == 1 {
		fd.redis.Expire(ctx, key, 1*time.Minute)
	}

	// Check if exceeds threshold
	if float64(count) > fd.clickRateThreshold {
		score.Score += 0.5
		score.Reasons = append(score.Reasons, "high_click_rate")
		score.Metadata["click_rate"] = string(rune(count))
	}
}

// SIVT Checks

// checkDeviceFingerprint checks for device fingerprint anomalies
func (fd *FraudDetector) checkDeviceFingerprint(ctx context.Context, req RequestData, score *FraudScore) {
	// Check if device ID has multiple IP addresses
	key := "device_ips:" + req.DeviceID

	// Add IP to set
	fd.redis.SAdd(ctx, key, req.IP)
	fd.redis.Expire(ctx, key, 24*time.Hour)

	// Get IP count
	count, err := fd.redis.SCard(ctx, key).Result()
	if err != nil {
		return
	}

	// Multiple IPs for same device (IP hopping)
	if count > 5 {
		score.Score += 0.4
		score.FraudType = SIVT
		score.Reasons = append(score.Reasons, "ip_hopping")
		score.Metadata["unique_ips"] = string(rune(count))
	}
}

// checkClickPatterns checks for suspicious click patterns
func (fd *FraudDetector) checkClickPatterns(ctx context.Context, req RequestData, score *FraudScore) {
	// Check time between clicks
	key := "last_click:" + req.DeviceID

	lastClick, err := fd.redis.Get(ctx, key).Result()
	if err == redis.Nil {
		// First click
		fd.redis.Set(ctx, key, req.Timestamp.Unix(), 1*time.Hour)
		return
	} else if err != nil {
		return
	}

	// Calculate time difference
	var lastTime int64
	if _, err := fmt.Sscanf(lastClick, "%d", &lastTime); err == nil {
		diff := req.Timestamp.Unix() - lastTime

		// Clicks too fast (< 2 seconds)
		if diff < 2 {
			score.Score += 0.3
			score.FraudType = SIVT
			score.Reasons = append(score.Reasons, "rapid_clicks")
		}
	}

	// Update last click time
	fd.redis.Set(ctx, key, req.Timestamp.Unix(), 1*time.Hour)
}

// checkSessionBehavior checks session behavior patterns
func (fd *FraudDetector) checkSessionBehavior(ctx context.Context, req RequestData, score *FraudScore) {
	// Check if same placement clicked multiple times in session
	key := "session_placements:" + req.SessionID

	count, err := fd.redis.HIncrBy(ctx, key, req.PlacementID, 1).Result()
	if err != nil {
		return
	}

	// Set expiry
	if count == 1 {
		fd.redis.Expire(ctx, key, 30*time.Minute)
	}

	// Multiple clicks on same placement
	if count > 3 {
		score.Score += 0.4
		score.FraudType = SIVT
		score.Reasons = append(score.Reasons, "repeated_placement_clicks")
	}
}

// Helper functions

// loadDatacenterIPRanges loads known datacenter IP ranges
func loadDatacenterIPRanges() []*net.IPNet {
	// In production, load from database or external service
	ranges := []string{
		"54.0.0.0/8",    // AWS
		"35.0.0.0/8",    // GCP
		"13.104.0.0/14", // Azure
		"157.56.0.0/14", // Azure
		"104.16.0.0/12", // Cloudflare
	}

	var ipNets []*net.IPNet
	for _, r := range ranges {
		_, ipNet, err := net.ParseCIDR(r)
		if err == nil {
			ipNets = append(ipNets, ipNet)
		}
	}

	return ipNets
}

// loadKnownBots loads known bot user agents
func loadKnownBots() map[string]bool {
	return map[string]bool{
		"bot":       true,
		"crawler":   true,
		"spider":    true,
		"scraper":   true,
		"curl":      true,
		"wget":      true,
		"python":    true,
		"java":      true,
		"okhttp":    true,
		"headless":  true,
		"phantom":   true,
		"selenium":  true,
		"webdriver": true,
	}
}

// loadSuspiciousPatterns loads suspicious user agent patterns
func loadSuspiciousPatterns() []*regexp.Regexp {
	patterns := []string{
		`(?i)bot|crawler|spider|scraper`,
		`(?i)curl|wget|python-requests`,
		`(?i)headless|phantom|selenium`,
		`^Mozilla/5\.0$`, // Just "Mozilla/5.0"
	}

	var regexps []*regexp.Regexp
	for _, p := range patterns {
		if re, err := regexp.Compile(p); err == nil {
			regexps = append(regexps, re)
		}
	}

	return regexps
}

// BlockList manages blocked IPs and devices
type BlockList struct {
	redis *redis.Client
}

// NewBlockList creates a new blocklist
func NewBlockList(redisClient *redis.Client) *BlockList {
	return &BlockList{
		redis: redisClient,
	}
}

// AddIP adds IP to blocklist
func (bl *BlockList) AddIP(ctx context.Context, ip string, duration time.Duration) error {
	key := "blocked_ip:" + ip
	return bl.redis.Set(ctx, key, "1", duration).Err()
}

// IsIPBlocked checks if IP is blocked
func (bl *BlockList) IsIPBlocked(ctx context.Context, ip string) bool {
	key := "blocked_ip:" + ip
	exists, err := bl.redis.Exists(ctx, key).Result()
	return err == nil && exists > 0
}

// AddDevice adds device to blocklist
func (bl *BlockList) AddDevice(ctx context.Context, deviceID string, duration time.Duration) error {
	key := "blocked_device:" + deviceID
	return bl.redis.Set(ctx, key, "1", duration).Err()
}

// IsDeviceBlocked checks if device is blocked
func (bl *BlockList) IsDeviceBlocked(ctx context.Context, deviceID string) bool {
	key := "blocked_device:" + deviceID
	exists, err := bl.redis.Exists(ctx, key).Result()
	return err == nil && exists > 0
}

// BlockIP blocks an IP address
func (bl *BlockList) BlockIP(ctx context.Context, ip string, duration time.Duration) error {
	return bl.AddIP(ctx, ip, duration)
}

// BlockDevice blocks a device
func (bl *BlockList) BlockDevice(ctx context.Context, deviceID string, duration time.Duration) error {
	return bl.AddDevice(ctx, deviceID, duration)
}

// UnblockIP unblocks an IP address
func (bl *BlockList) UnblockIP(ctx context.Context, ip string) error {
	key := "blocked_ip:" + ip
	return bl.redis.Del(ctx, key).Err()
}

// UnblockDevice unblocks a device
func (bl *BlockList) UnblockDevice(ctx context.Context, deviceID string) error {
	key := "blocked_device:" + deviceID
	return bl.redis.Del(ctx, key).Err()
}

// GetBlockedIPs returns list of blocked IPs
func (bl *BlockList) GetBlockedIPs(ctx context.Context) ([]string, error) {
	var cursor uint64
	var ips []string

	for {
		keys, nextCursor, err := bl.redis.Scan(ctx, cursor, "blocked_ip:*", 100).Result()
		if err != nil {
			return nil, err
		}

		for _, key := range keys {
			ip := strings.TrimPrefix(key, "blocked_ip:")
			ips = append(ips, ip)
		}

		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	return ips, nil
}

// GetBlockedDevices returns list of blocked devices
func (bl *BlockList) GetBlockedDevices(ctx context.Context) ([]string, error) {
	var cursor uint64
	var devices []string

	for {
		keys, nextCursor, err := bl.redis.Scan(ctx, cursor, "blocked_device:*", 100).Result()
		if err != nil {
			return nil, err
		}

		for _, key := range keys {
			device := strings.TrimPrefix(key, "blocked_device:")
			devices = append(devices, device)
		}

		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	return devices, nil
}

// GetPublisherStats returns fraud statistics for a publisher
func (fd *FraudDetector) GetPublisherStats(ctx context.Context, publisherID string) map[string]interface{} {
	// This would query analytics for publisher fraud stats
	// For now, return placeholder stats

	return map[string]interface{}{
		"publisher_id":    publisherID,
		"total_requests":  0,
		"fraud_detected":  0,
		"fraud_rate":      0.0,
		"blocked_ips":     0,
		"blocked_devices": 0,
	}
}
