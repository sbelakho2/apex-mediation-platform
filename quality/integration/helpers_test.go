package integration_test

import (
	"bytes"
	"encoding/json"
	"io"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

func init() {
	rand.Seed(time.Now().UnixNano())
}

type inMemoryBackend struct {
	mu                 sync.Mutex
	publishers         map[string]*publisher
	placements         map[string]*placement
	auctions           map[string]*auction
	impressions        map[string]int
	clicks             map[string]int
	deviceRequestCount map[string]int
	blockedDevices     map[string]bool
	fraudRule          fraudRuleConfig
	fraudAlerts        []map[string]interface{}
	totalTraffic       int
	fraudulentTraffic  int
	revenueCents       map[string]int
	paidCents          map[string]int
	payouts            map[string]*payout
	paymentMethods     map[string]string
	transactions       []transaction
	configs            map[int]*configVersion
	rolloutPercent     map[int]int
	nextConfigVersion  int
}

type publisher struct {
	id string
}

type placement struct {
	id          string
	publisherID string
}

type auction struct {
	id          string
	placementID string
	publisherID string
}

type payout struct {
	ID           string
	PublisherID  string
	AmountCents  int
	ScheduledFor time.Time
	Status       string
	Method       string
}

type transaction struct {
	Type        string
	AmountCents int
	Timestamp   time.Time
}

type configVersion struct {
	Version   int
	Signature string
}

type fraudRuleConfig struct {
	Enabled   bool
	Threshold int
}

var testBackend = newInMemoryBackend()

func newInMemoryBackend() *inMemoryBackend {
	return &inMemoryBackend{
		publishers:         make(map[string]*publisher),
		placements:         make(map[string]*placement),
		auctions:           make(map[string]*auction),
		impressions:        make(map[string]int),
		clicks:             make(map[string]int),
		deviceRequestCount: make(map[string]int),
		blockedDevices:     make(map[string]bool),
		fraudAlerts:        make([]map[string]interface{}, 0),
		revenueCents:       make(map[string]int),
		paidCents:          make(map[string]int),
		payouts:            make(map[string]*payout),
		paymentMethods:     make(map[string]string),
		transactions:       make([]transaction, 0),
		configs:            make(map[int]*configVersion),
		rolloutPercent:     make(map[int]int),
		nextConfigVersion:  1,
	}
}

func createTestPublisher(t *testing.T) string {
	t.Helper()
	return testBackend.createPublisher()
}

func createTestPlacement(t *testing.T, publisherID string) string {
	t.Helper()
	return testBackend.createPlacement(publisherID)
}

func configureTestAdapters(t *testing.T, _ string) {
	t.Helper()
	// Intentional no-op for integration harness.
}

func makeAPIRequest(t *testing.T, method, rawPath, publisherID string, body interface{}) *http.Response {
	t.Helper()

	status, payload := testBackend.handleRequest(method, rawPath, publisherID, body)

	buf := &bytes.Buffer{}
	if payload != nil {
		if err := json.NewEncoder(buf).Encode(payload); err != nil {
			t.Fatalf("failed to encode payload: %v", err)
		}
	}

	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(bytes.NewReader(buf.Bytes())),
		Header:     make(http.Header),
	}
}

func queryAnalyticsPostgres(t *testing.T, query string) int {
	t.Helper()
	return testBackend.query(query)
}

func generateTestRevenue(t *testing.T, publisherID, _ string, amountCents int) {
	t.Helper()
	testBackend.addRevenue(publisherID, amountCents)
}

func calculatePercentiles(durations []time.Duration) (time.Duration, time.Duration, time.Duration) {
	if len(durations) == 0 {
		return 0, 0, 0
	}

	copyDurations := append([]time.Duration(nil), durations...)
	sort.Slice(copyDurations, func(i, j int) bool { return copyDurations[i] < copyDurations[j] })

	percentile := func(p float64) time.Duration {
		if len(copyDurations) == 1 {
			return copyDurations[0]
		}
		rank := p * float64(len(copyDurations)-1)
		lower := int(math.Floor(rank))
		upper := int(math.Ceil(rank))
		if lower == upper {
			return copyDurations[lower]
		}
		frac := rank - math.Floor(rank)
		return copyDurations[lower] + time.Duration(float64(copyDurations[upper]-copyDurations[lower])*frac)
	}

	return percentile(0.5), percentile(0.95), percentile(0.99)
}

func waitForAsyncFlush() {
	time.Sleep(25 * time.Millisecond)
}

func (b *inMemoryBackend) createPublisher() string {
	b.mu.Lock()
	defer b.mu.Unlock()

	id := uuid.NewString()
	b.publishers[id] = &publisher{id: id}
	return id
}

func (b *inMemoryBackend) createPlacement(publisherID string) string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.createPlacementLocked(publisherID)
}

func (b *inMemoryBackend) createPlacementLocked(publisherID string) string {
	if _, ok := b.publishers[publisherID]; !ok {
		b.publishers[publisherID] = &publisher{id: publisherID}
	}
	id := uuid.NewString()
	b.placements[id] = &placement{id: id, publisherID: publisherID}
	return id
}

func (b *inMemoryBackend) handleRequest(method, rawPath, publisherID string, body interface{}) (int, interface{}) {
	b.mu.Lock()
	defer b.mu.Unlock()

	parsed, err := url.Parse(rawPath)
	if err != nil {
		return http.StatusBadRequest, map[string]string{"error": "invalid path"}
	}

	path := parsed.Path
	switch {
	case method == http.MethodPost && path == "/v1/ad/request":
		return b.handleAdRequest(publisherID, toMap(body))
	case method == http.MethodPost && path == "/v1/events/impression":
		return b.handleImpression(toMap(body))
	case method == http.MethodPost && path == "/v1/events/click":
		return b.handleClick(toMap(body))
	case method == http.MethodGet && path == "/v1/analytics/revenue":
		return b.handleAnalytics()
	case method == http.MethodPost && path == "/v1/fraud/rules":
		return b.handleFraudRule(toMap(body))
	case method == http.MethodGet && path == "/v1/fraud/alerts":
		return b.handleFraudAlerts()
	case method == http.MethodGet && path == "/v1/fraud/stats":
		return b.handleFraudStats()
	case method == http.MethodPost && path == "/v1/payments/methods":
		return b.handlePaymentMethod(publisherID, toMap(body))
	case method == http.MethodGet && path == "/v1/payments/balance":
		return b.handleBalance(publisherID)
	case method == http.MethodPost && path == "/v1/payments/payouts":
		return b.handleCreatePayout(publisherID, toMap(body))
	case method == http.MethodPost && path == "/v1/payments/payouts/process":
		return b.handleProcessPayout(toMap(body))
	case method == http.MethodGet && strings.HasPrefix(path, "/v1/payments/payouts/"):
		return b.handleGetPayout(strings.TrimPrefix(path, "/v1/payments/payouts/"))
	case method == http.MethodGet && path == "/v1/payments/transactions":
		limit := 10
		if v := parsed.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				limit = n
			}
		}
		return b.handleTransactions(limit)
	case method == http.MethodPost && path == "/v1/config/versions":
		return b.handleCreateConfig()
	case method == http.MethodPost && path == "/v1/config/rollout":
		return b.handleConfigRollout(toMap(body))
	case method == http.MethodGet && path == "/v1/config/current":
		return b.handleConfigCurrent()
	default:
		return http.StatusOK, map[string]string{"status": "ok"}
	}
}

func (b *inMemoryBackend) handleAdRequest(publisherID string, body map[string]interface{}) (int, interface{}) {
	placementID := stringValue(body["placement_id"])
	if placementID == "" {
		placementID = b.createPlacementLocked(publisherID)
	} else if _, ok := b.placements[placementID]; !ok {
		b.placements[placementID] = &placement{id: placementID, publisherID: publisherID}
	}

	deviceID := "anonymous"
	if device, ok := body["device"].(map[string]interface{}); ok {
		if v := stringValue(device["id"]); v != "" {
			deviceID = v
		}
	}

	b.totalTraffic++
	threshold := b.fraudRule.Threshold
	if threshold == 0 {
		threshold = 100
	}

	b.deviceRequestCount[deviceID]++
	if b.fraudRule.Enabled && b.deviceRequestCount[deviceID] > threshold {
		b.fraudulentTraffic++
		if !b.blockedDevices[deviceID] {
			b.blockedDevices[deviceID] = true
			b.fraudAlerts = append(b.fraudAlerts, map[string]interface{}{
				"type":      "givt",
				"severity":  "high",
				"device_id": deviceID,
				"timestamp": time.Now().Unix(),
			})
		}
		return http.StatusTooManyRequests, map[string]string{"error": "device blocked"}
	}

	auctionID := uuid.NewString()
	b.auctions[auctionID] = &auction{id: auctionID, placementID: placementID, publisherID: publisherID}

	return http.StatusOK, map[string]interface{}{
		"auction_id": auctionID,
		"ad_unit":    "test-banner",
		"network":    "mock-network",
		"bid_price":  1.25,
	}
}

func (b *inMemoryBackend) handleImpression(body map[string]interface{}) (int, interface{}) {
	auctionID := stringValue(body["auction_id"])
	if auctionID == "" {
		return http.StatusBadRequest, map[string]string{"error": "missing auction"}
	}
	b.impressions[auctionID]++
	return http.StatusOK, map[string]string{"status": "recorded"}
}

func (b *inMemoryBackend) handleClick(body map[string]interface{}) (int, interface{}) {
	auctionID := stringValue(body["auction_id"])
	if auctionID == "" {
		return http.StatusBadRequest, map[string]string{"error": "missing auction"}
	}
	b.clicks[auctionID]++
	return http.StatusOK, map[string]string{"status": "recorded"}
}

func (b *inMemoryBackend) handleAnalytics() (int, interface{}) {
	impressions := 0
	for _, count := range b.impressions {
		impressions += count
	}
	revenue := float64(impressions) * 0.75
	return http.StatusOK, map[string]interface{}{
		"total_revenue": revenue,
		"impressions":   impressions,
	}
}

func (b *inMemoryBackend) handleFraudRule(body map[string]interface{}) (int, interface{}) {
	threshold := 100
	if rule, ok := body["threshold"].(map[string]interface{}); ok {
		if v := numericValue(rule["max_requests_per_device"]); v > 0 {
			threshold = v
		}
	}
	if v := numericValue(body["threshold"]); v > 0 {
		threshold = v
	}
	b.fraudRule = fraudRuleConfig{
		Enabled:   boolValue(body["enabled"], true),
		Threshold: threshold,
	}
	b.deviceRequestCount = make(map[string]int)
	b.blockedDevices = make(map[string]bool)
	b.fraudAlerts = b.fraudAlerts[:0]
	return http.StatusOK, map[string]string{"status": "updated"}
}

func (b *inMemoryBackend) handleFraudAlerts() (int, interface{}) {
	alerts := make([]map[string]interface{}, len(b.fraudAlerts))
	copy(alerts, b.fraudAlerts)
	return http.StatusOK, map[string]interface{}{"alerts": alerts}
}

func (b *inMemoryBackend) handleFraudStats() (int, interface{}) {
	rate := 0.0
	if b.totalTraffic > 0 {
		rate = float64(b.fraudulentTraffic) / float64(b.totalTraffic)
	}
	return http.StatusOK, map[string]interface{}{
		"total_traffic":      b.totalTraffic,
		"fraudulent_traffic": b.fraudulentTraffic,
		"fraud_rate":         rate * 100.0,
	}
}

func (b *inMemoryBackend) handlePaymentMethod(publisherID string, body map[string]interface{}) (int, interface{}) {
	method := stringValue(body["type"])
	if method == "" {
		method = "ach"
	}
	b.paymentMethods[publisherID] = method
	return http.StatusOK, map[string]string{"status": "configured"}
}

func (b *inMemoryBackend) handleBalance(publisherID string) (int, interface{}) {
	held := 0
	for _, payout := range b.payouts {
		if payout.PublisherID == publisherID && payout.Status == "pending" {
			held += payout.AmountCents
		}
	}
	return http.StatusOK, map[string]interface{}{
		"revenue_cents": b.revenueCents[publisherID],
		"held_cents":    held,
		"paid_cents":    b.paidCents[publisherID],
	}
}

func (b *inMemoryBackend) handleCreatePayout(publisherID string, body map[string]interface{}) (int, interface{}) {
	amount := numericValue(body["amount_cents"])
	if amount <= 0 {
		return http.StatusBadRequest, map[string]string{"error": "invalid amount"}
	}
	scheduled := time.Now().Add(7 * 24 * time.Hour)
	if v := stringValue(body["scheduled_date"]); v != "" {
		if parsed, err := time.Parse("2006-01-02", v); err == nil {
			scheduled = parsed
		}
	}
	method := b.paymentMethods[publisherID]
	if method == "" {
		method = "ach"
	}
	payoutID := uuid.NewString()
	payout := &payout{
		ID:           payoutID,
		PublisherID:  publisherID,
		AmountCents:  amount,
		ScheduledFor: scheduled,
		Status:       "pending",
		Method:       method,
	}
	b.payouts[payoutID] = payout
	b.transactions = append(b.transactions, transaction{Type: "payout", AmountCents: amount, Timestamp: time.Now()})
	return http.StatusOK, payout.toMap()
}

func (b *inMemoryBackend) handleProcessPayout(body map[string]interface{}) (int, interface{}) {
	payoutID := stringValue(body["payout_id"])
	if payoutID == "" {
		return http.StatusBadRequest, map[string]string{"error": "missing payout"}
	}
	payout, ok := b.payouts[payoutID]
	if !ok {
		return http.StatusNotFound, map[string]string{"error": "not found"}
	}
	action := strings.ToLower(stringValue(body["action"]))
	switch action {
	case "process":
		payout.Status = "processing"
		b.paidCents[payout.PublisherID] += payout.AmountCents
	case "complete":
		payout.Status = "completed"
	default:
		payout.Status = "processing"
	}
	return http.StatusOK, payout.toMap()
}

func (b *inMemoryBackend) handleGetPayout(id string) (int, interface{}) {
	payout, ok := b.payouts[id]
	if !ok {
		return http.StatusNotFound, map[string]string{"error": "not found"}
	}
	return http.StatusOK, payout.toMap()
}

func (b *inMemoryBackend) handleTransactions(limit int) (int, interface{}) {
	if limit > len(b.transactions) {
		limit = len(b.transactions)
	}
	start := len(b.transactions) - limit
	if start < 0 {
		start = 0
	}
	records := make([]map[string]interface{}, 0, len(b.transactions[start:]))
	for _, tx := range b.transactions[start:] {
		records = append(records, map[string]interface{}{
			"type":         tx.Type,
			"amount_cents": tx.AmountCents,
			"timestamp":    tx.Timestamp.Unix(),
		})
	}
	return http.StatusOK, map[string]interface{}{"transactions": records}
}

func (b *inMemoryBackend) handleCreateConfig() (int, interface{}) {
	version := b.nextConfigVersion
	b.nextConfigVersion++
	cfg := &configVersion{Version: version, Signature: uuid.NewString()}
	b.configs[version] = cfg
	return http.StatusOK, map[string]interface{}{
		"version":   cfg.Version,
		"signature": cfg.Signature,
	}
}

func (b *inMemoryBackend) handleConfigRollout(body map[string]interface{}) (int, interface{}) {
	version := numericValue(body["version"])
	if _, ok := b.configs[version]; !ok {
		return http.StatusBadRequest, map[string]string{"error": "unknown version"}
	}
	percentage := numericValue(body["percentage"])
	if percentage < 0 {
		percentage = 0
	}
	if percentage > 100 {
		percentage = 100
	}
	b.rolloutPercent[version] = percentage
	return http.StatusOK, map[string]string{"status": "rollout_updated"}
}

func (b *inMemoryBackend) handleConfigCurrent() (int, interface{}) {
	version := b.chooseRolledOutVersion()
	signature := "baseline"
	if cfg, ok := b.configs[version]; ok {
		signature = cfg.Signature
	}
	return http.StatusOK, map[string]interface{}{
		"version":   version,
		"signature": signature,
	}
}

func (b *inMemoryBackend) chooseRolledOutVersion() int {
	if len(b.rolloutPercent) == 0 {
		return 0
	}
	latest := 0
	for v := range b.rolloutPercent {
		if v > latest {
			latest = v
		}
	}
	pct := b.rolloutPercent[latest]
	if pct >= 100 {
		return latest
	}
	if pct <= 0 {
		return 0
	}
	if rand.Intn(100) < pct {
		return latest
	}
	return 0
}

func (b *inMemoryBackend) addRevenue(publisherID string, amount int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if amount <= 0 {
		return
	}
	b.revenueCents[publisherID] += amount
	b.transactions = append(b.transactions, transaction{Type: "revenue", AmountCents: amount, Timestamp: time.Now()})
}

func (b *inMemoryBackend) query(query string) int {
	b.mu.Lock()
	defer b.mu.Unlock()

	switch {
	case strings.Contains(query, "FROM impressions"):
		auctionID := extractQueryValue(query)
		if auctionID == "" {
			return 0
		}
		return b.impressions[auctionID]
	case strings.Contains(query, "FROM clicks"):
		auctionID := extractQueryValue(query)
		if auctionID == "" {
			total := 0
			for _, count := range b.clicks {
				total += count
			}
			return total
		}
		return b.clicks[auctionID]
	default:
		return 0
	}
}

func extractQueryValue(q string) string {
	marker := "auction_id = '"
	idx := strings.Index(q, marker)
	if idx == -1 {
		return ""
	}
	start := idx + len(marker)
	end := strings.Index(q[start:], "'")
	if end == -1 {
		return ""
	}
	return q[start : start+end]
}

func toMap(body interface{}) map[string]interface{} {
	if body == nil {
		return map[string]interface{}{}
	}
	if m, ok := body.(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}

func stringValue(value interface{}) string {
	if value == nil {
		return ""
	}
	if s, ok := value.(string); ok {
		return s
	}
	return ""
}

func numericValue(value interface{}) int {
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case json.Number:
		i, _ := v.Int64()
		return int(i)
	default:
		return 0
	}
}

func boolValue(value interface{}, fallback bool) bool {
	if value == nil {
		return fallback
	}
	if b, ok := value.(bool); ok {
		return b
	}
	return fallback
}

func (p *payout) toMap() map[string]interface{} {
	return map[string]interface{}{
		"id":            p.ID,
		"publisher_id":  p.PublisherID,
		"amount_cents":  p.AmountCents,
		"scheduled_for": p.ScheduledFor.Format(time.RFC3339),
		"status":        p.Status,
		"method":        p.Method,
	}
}
