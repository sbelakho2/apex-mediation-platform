package reporting

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// FraudAlert represents a fraud detection event
type FraudAlert struct {
	ID            string                 `json:"id"`
	Timestamp     time.Time              `json:"timestamp"`
	AlertType     string                 `json:"alert_type"` // givt, sivt, ml_fraud, anomaly
	Severity      string                 `json:"severity"`   // low, medium, high, critical
	PublisherID   string                 `json:"publisher_id"`
	AdvertiserID  string                 `json:"advertiser_id,omitempty"`
	DeviceID      string                 `json:"device_id,omitempty"`
	IPAddress     string                 `json:"ip_address,omitempty"`
	FraudScore    float64                `json:"fraud_score"`
	DetectionType string                 `json:"detection_type"` // rule_based, ml_based, anomaly
	Metadata      map[string]interface{} `json:"metadata"`
	Action        string                 `json:"action"` // block, flag, monitor
}

// BlockedEntity represents a blocked publisher, advertiser, device, or IP
type BlockedEntity struct {
	EntityType   string    `json:"entity_type"` // publisher, advertiser, device, ip
	EntityID     string    `json:"entity_id"`
	BlockedAt    time.Time `json:"blocked_at"`
	BlockedBy    string    `json:"blocked_by"` // system, admin
	Reason       string    `json:"reason"`
	ExpiresAt    time.Time `json:"expires_at,omitempty"` // empty for permanent blocks
	FraudScore   float64   `json:"fraud_score"`
	IncidentIDs  []string  `json:"incident_ids"`
	IsActive     bool      `json:"is_active"`
	ReviewStatus string    `json:"review_status"` // pending, reviewed, appealed
}

// FraudStats represents aggregated fraud statistics
type FraudStats struct {
	PublisherID       string    `json:"publisher_id"`
	TimeWindow        string    `json:"time_window"` // 1h, 24h, 7d, 30d
	TotalRequests     int64     `json:"total_requests"`
	FraudRequests     int64     `json:"fraud_requests"`
	FraudRate         float64   `json:"fraud_rate"`
	GIVTDetections    int64     `json:"givt_detections"`
	SIVTDetections    int64     `json:"sivt_detections"`
	MLDetections      int64     `json:"ml_detections"`
	AnomalyDetections int64     `json:"anomaly_detections"`
	BlockedRequests   int64     `json:"blocked_requests"`
	FlaggedRequests   int64     `json:"flagged_requests"`
	AverageFraudScore float64   `json:"average_fraud_score"`
	TopFraudTypes     []string  `json:"top_fraud_types"`
	LastUpdated       time.Time `json:"last_updated"`
}

// WebhookConfig represents webhook notification configuration
type WebhookConfig struct {
	ID            string            `json:"id"`
	PublisherID   string            `json:"publisher_id"`
	URL           string            `json:"url"`
	Secret        string            `json:"secret"`
	Enabled       bool              `json:"enabled"`
	Events        []string          `json:"events"` // fraud_detected, entity_blocked, threshold_exceeded
	MinSeverity   string            `json:"min_severity"`
	RetryPolicy   RetryPolicy       `json:"retry_policy"`
	Headers       map[string]string `json:"headers"`
	CreatedAt     time.Time         `json:"created_at"`
	LastTriggered time.Time         `json:"last_triggered,omitempty"`
}

type RetryPolicy struct {
	MaxRetries    int           `json:"max_retries"`
	RetryInterval time.Duration `json:"retry_interval"`
	BackoffFactor float64       `json:"backoff_factor"`
}

// FraudReporter handles fraud alert publishing, blocking, and reporting
type FraudReporter struct {
	redis         *redis.Client
	pubsubClient  *redis.Client
	alertChannel  string
	blockCache    *sync.Map // in-memory cache for blocked entities
	webhookClient WebhookClient
	mu            sync.RWMutex
}

type WebhookClient interface {
	Send(ctx context.Context, webhook WebhookConfig, alert FraudAlert) error
}

// NewFraudReporter creates a new fraud reporter
func NewFraudReporter(redisClient *redis.Client, webhookClient WebhookClient) *FraudReporter {
	return &FraudReporter{
		redis:         redisClient,
		pubsubClient:  redisClient,
		alertChannel:  "fraud:alerts",
		blockCache:    &sync.Map{},
		webhookClient: webhookClient,
	}
}

// PublishAlert publishes a fraud alert to Redis pub/sub
func (r *FraudReporter) PublishAlert(ctx context.Context, alert FraudAlert) error {
	// Generate alert ID if not provided
	if alert.ID == "" {
		alert.ID = fmt.Sprintf("alert_%d", time.Now().UnixNano())
	}
	alert.Timestamp = time.Now()

	// Serialize alert
	data, err := json.Marshal(alert)
	if err != nil {
		return fmt.Errorf("failed to marshal alert: %w", err)
	}

	// Publish to Redis pub/sub
	if err := r.redis.Publish(ctx, r.alertChannel, data).Err(); err != nil {
		return fmt.Errorf("failed to publish alert: %w", err)
	}

	// Store alert in Redis for history (7 day TTL)
	alertKey := fmt.Sprintf("fraud:alert:%s", alert.ID)
	if err := r.redis.Set(ctx, alertKey, data, 7*24*time.Hour).Err(); err != nil {
		return fmt.Errorf("failed to store alert: %w", err)
	}

	// Add to publisher's alert index
	pubAlertKey := fmt.Sprintf("fraud:alerts:publisher:%s", alert.PublisherID)
	if err := r.redis.ZAdd(ctx, pubAlertKey, redis.Z{
		Score:  float64(alert.Timestamp.Unix()),
		Member: alert.ID,
	}).Err(); err != nil {
		return fmt.Errorf("failed to index alert: %w", err)
	}

	// Set expiry on publisher index (30 days)
	r.redis.Expire(ctx, pubAlertKey, 30*24*time.Hour)

	// Update fraud statistics
	if err := r.updateFraudStats(ctx, alert); err != nil {
		return fmt.Errorf("failed to update fraud stats: %w", err)
	}

	// Trigger webhooks asynchronously
	go r.triggerWebhooks(context.Background(), alert)

	return nil
}

// BlockEntity blocks a publisher, advertiser, device, or IP
func (r *FraudReporter) BlockEntity(ctx context.Context, entity BlockedEntity) error {
	entity.BlockedAt = time.Now()
	entity.IsActive = true
	entity.ReviewStatus = "pending"

	// Serialize entity
	data, err := json.Marshal(entity)
	if err != nil {
		return fmt.Errorf("failed to marshal blocked entity: %w", err)
	}

	// Store in Redis
	blockKey := fmt.Sprintf("fraud:block:%s:%s", entity.EntityType, entity.EntityID)
	ttl := time.Duration(0)
	if !entity.ExpiresAt.IsZero() {
		ttl = time.Until(entity.ExpiresAt)
	}

	if ttl > 0 {
		if err := r.redis.Set(ctx, blockKey, data, ttl).Err(); err != nil {
			return fmt.Errorf("failed to store block: %w", err)
		}
	} else {
		if err := r.redis.Set(ctx, blockKey, data, 0).Err(); err != nil {
			return fmt.Errorf("failed to store permanent block: %w", err)
		}
	}

	// Add to global block index
	blockIndexKey := fmt.Sprintf("fraud:blocks:%s", entity.EntityType)
	if err := r.redis.ZAdd(ctx, blockIndexKey, redis.Z{
		Score:  float64(entity.BlockedAt.Unix()),
		Member: entity.EntityID,
	}).Err(); err != nil {
		return fmt.Errorf("failed to index block: %w", err)
	}

	// Update in-memory cache
	cacheKey := fmt.Sprintf("%s:%s", entity.EntityType, entity.EntityID)
	r.blockCache.Store(cacheKey, entity)

	// Publish block notification
	blockAlert := FraudAlert{
		ID:            fmt.Sprintf("block_%d", time.Now().UnixNano()),
		Timestamp:     time.Now(),
		AlertType:     "entity_blocked",
		Severity:      "high",
		PublisherID:   entity.EntityID,
		DetectionType: "system",
		Action:        "block",
		Metadata: map[string]interface{}{
			"entity_type": entity.EntityType,
			"reason":      entity.Reason,
			"expires_at":  entity.ExpiresAt,
		},
	}

	return r.PublishAlert(ctx, blockAlert)
}

// UnblockEntity removes a block
func (r *FraudReporter) UnblockEntity(ctx context.Context, entityType, entityID string) error {
	blockKey := fmt.Sprintf("fraud:block:%s:%s", entityType, entityID)

	// Remove from Redis
	if err := r.redis.Del(ctx, blockKey).Err(); err != nil {
		return fmt.Errorf("failed to remove block: %w", err)
	}

	// Remove from index
	blockIndexKey := fmt.Sprintf("fraud:blocks:%s", entityType)
	if err := r.redis.ZRem(ctx, blockIndexKey, entityID).Err(); err != nil {
		return fmt.Errorf("failed to remove from index: %w", err)
	}

	// Remove from cache
	cacheKey := fmt.Sprintf("%s:%s", entityType, entityID)
	r.blockCache.Delete(cacheKey)

	return nil
}

// IsBlocked checks if an entity is blocked
func (r *FraudReporter) IsBlocked(ctx context.Context, entityType, entityID string) (bool, *BlockedEntity, error) {
	// Check cache first
	cacheKey := fmt.Sprintf("%s:%s", entityType, entityID)
	if cached, ok := r.blockCache.Load(cacheKey); ok {
		entity := cached.(BlockedEntity)
		// Check if expired
		if !entity.ExpiresAt.IsZero() && time.Now().After(entity.ExpiresAt) {
			r.UnblockEntity(ctx, entityType, entityID)
			return false, nil, nil
		}
		return true, &entity, nil
	}

	// Check Redis
	blockKey := fmt.Sprintf("fraud:block:%s:%s", entityType, entityID)
	data, err := r.redis.Get(ctx, blockKey).Bytes()
	if err == redis.Nil {
		return false, nil, nil
	}
	if err != nil {
		return false, nil, fmt.Errorf("failed to check block: %w", err)
	}

	var entity BlockedEntity
	if err := json.Unmarshal(data, &entity); err != nil {
		return false, nil, fmt.Errorf("failed to unmarshal block: %w", err)
	}

	// Check if expired
	if !entity.ExpiresAt.IsZero() && time.Now().After(entity.ExpiresAt) {
		r.UnblockEntity(ctx, entityType, entityID)
		return false, nil, nil
	}

	// Update cache
	r.blockCache.Store(cacheKey, entity)

	return true, &entity, nil
}

// GetFraudStats retrieves fraud statistics for a publisher
func (r *FraudReporter) GetFraudStats(ctx context.Context, publisherID string, timeWindow string) (*FraudStats, error) {
	statsKey := fmt.Sprintf("fraud:stats:%s:%s", publisherID, timeWindow)

	data, err := r.redis.Get(ctx, statsKey).Bytes()
	if err == redis.Nil {
		// Return empty stats
		return &FraudStats{
			PublisherID:   publisherID,
			TimeWindow:    timeWindow,
			LastUpdated:   time.Now(),
			TopFraudTypes: []string{},
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get fraud stats: %w", err)
	}

	var stats FraudStats
	if err := json.Unmarshal(data, &stats); err != nil {
		return nil, fmt.Errorf("failed to unmarshal stats: %w", err)
	}

	return &stats, nil
}

// GetRecentAlerts retrieves recent fraud alerts for a publisher
func (r *FraudReporter) GetRecentAlerts(ctx context.Context, publisherID string, limit int64) ([]FraudAlert, error) {
	pubAlertKey := fmt.Sprintf("fraud:alerts:publisher:%s", publisherID)

	// Get most recent alert IDs
	alertIDs, err := r.redis.ZRevRange(ctx, pubAlertKey, 0, limit-1).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get alert IDs: %w", err)
	}

	alerts := make([]FraudAlert, 0, len(alertIDs))
	for _, alertID := range alertIDs {
		alertKey := fmt.Sprintf("fraud:alert:%s", alertID)
		data, err := r.redis.Get(ctx, alertKey).Bytes()
		if err == redis.Nil {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("failed to get alert %s: %w", alertID, err)
		}

		var alert FraudAlert
		if err := json.Unmarshal(data, &alert); err != nil {
			return nil, fmt.Errorf("failed to unmarshal alert: %w", err)
		}
		alerts = append(alerts, alert)
	}

	return alerts, nil
}

// GetBlockedEntities retrieves all blocked entities of a given type
func (r *FraudReporter) GetBlockedEntities(ctx context.Context, entityType string, limit int64) ([]BlockedEntity, error) {
	blockIndexKey := fmt.Sprintf("fraud:blocks:%s", entityType)

	// Get most recent blocked entity IDs
	entityIDs, err := r.redis.ZRevRange(ctx, blockIndexKey, 0, limit-1).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get blocked entity IDs: %w", err)
	}

	entities := make([]BlockedEntity, 0, len(entityIDs))
	for _, entityID := range entityIDs {
		blockKey := fmt.Sprintf("fraud:block:%s:%s", entityType, entityID)
		data, err := r.redis.Get(ctx, blockKey).Bytes()
		if err == redis.Nil {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("failed to get blocked entity %s: %w", entityID, err)
		}

		var entity BlockedEntity
		if err := json.Unmarshal(data, &entity); err != nil {
			return nil, fmt.Errorf("failed to unmarshal entity: %w", err)
		}
		entities = append(entities, entity)
	}

	return entities, nil
}

// updateFraudStats updates fraud statistics based on an alert
func (r *FraudReporter) updateFraudStats(ctx context.Context, alert FraudAlert) error {
	timeWindows := []string{"1h", "24h", "7d", "30d"}

	for _, window := range timeWindows {
		statsKey := fmt.Sprintf("fraud:stats:%s:%s", alert.PublisherID, window)

		// Get current stats
		stats, err := r.GetFraudStats(ctx, alert.PublisherID, window)
		if err != nil {
			return err
		}

		// Update counters
		stats.FraudRequests++

		switch alert.DetectionType {
		case "rule_based":
			if alert.AlertType == "givt" {
				stats.GIVTDetections++
			} else if alert.AlertType == "sivt" {
				stats.SIVTDetections++
			}
		case "ml_based":
			stats.MLDetections++
		case "anomaly":
			stats.AnomalyDetections++
		}

		if alert.Action == "block" {
			stats.BlockedRequests++
		} else if alert.Action == "flag" {
			stats.FlaggedRequests++
		}

		// Update fraud rate
		if stats.TotalRequests > 0 {
			stats.FraudRate = float64(stats.FraudRequests) / float64(stats.TotalRequests)
		}

		stats.LastUpdated = time.Now()

		// Serialize and store
		data, err := json.Marshal(stats)
		if err != nil {
			return fmt.Errorf("failed to marshal stats: %w", err)
		}

		// Set TTL based on window
		var ttl time.Duration
		switch window {
		case "1h":
			ttl = 2 * time.Hour
		case "24h":
			ttl = 48 * time.Hour
		case "7d":
			ttl = 14 * 24 * time.Hour
		case "30d":
			ttl = 60 * 24 * time.Hour
		}

		if err := r.redis.Set(ctx, statsKey, data, ttl).Err(); err != nil {
			return fmt.Errorf("failed to store stats: %w", err)
		}
	}

	return nil
}

// IncrementTotalRequests increments the total request counter for stats
func (r *FraudReporter) IncrementTotalRequests(ctx context.Context, publisherID string) error {
	timeWindows := []string{"1h", "24h", "7d", "30d"}

	for _, window := range timeWindows {
		statsKey := fmt.Sprintf("fraud:stats:%s:%s", publisherID, window)

		stats, err := r.GetFraudStats(ctx, publisherID, window)
		if err != nil {
			return err
		}

		stats.TotalRequests++

		// Recalculate fraud rate
		if stats.TotalRequests > 0 {
			stats.FraudRate = float64(stats.FraudRequests) / float64(stats.TotalRequests)
		}

		stats.LastUpdated = time.Now()

		data, err := json.Marshal(stats)
		if err != nil {
			return err
		}

		var ttl time.Duration
		switch window {
		case "1h":
			ttl = 2 * time.Hour
		case "24h":
			ttl = 48 * time.Hour
		case "7d":
			ttl = 14 * 24 * time.Hour
		case "30d":
			ttl = 60 * 24 * time.Hour
		}

		if err := r.redis.Set(ctx, statsKey, data, ttl).Err(); err != nil {
			return err
		}
	}

	return nil
}

// triggerWebhooks sends alerts to configured webhooks
func (r *FraudReporter) triggerWebhooks(ctx context.Context, alert FraudAlert) {
	// Get webhooks for the publisher
	webhooksKey := fmt.Sprintf("fraud:webhooks:publisher:%s", alert.PublisherID)

	webhookIDs, err := r.redis.SMembers(ctx, webhooksKey).Result()
	if err != nil {
		return
	}

	for _, webhookID := range webhookIDs {
		webhookKey := fmt.Sprintf("fraud:webhook:%s", webhookID)
		data, err := r.redis.Get(ctx, webhookKey).Bytes()
		if err != nil {
			continue
		}

		var webhook WebhookConfig
		if err := json.Unmarshal(data, &webhook); err != nil {
			continue
		}

		// Check if webhook should be triggered
		if !webhook.Enabled {
			continue
		}

		// Check event type
		eventMatch := false
		for _, event := range webhook.Events {
			if event == alert.AlertType || event == "all" {
				eventMatch = true
				break
			}
		}
		if !eventMatch {
			continue
		}

		// Check severity
		if !r.meetsSeverity(alert.Severity, webhook.MinSeverity) {
			continue
		}

		// Send webhook
		go func(wh WebhookConfig) {
			if err := r.webhookClient.Send(ctx, wh, alert); err != nil {
				// Log error but don't fail
				return
			}

			// Update last triggered time
			wh.LastTriggered = time.Now()
			data, _ := json.Marshal(wh)
			r.redis.Set(ctx, webhookKey, data, 0)
		}(webhook)
	}
}

// meetsSeverity checks if alert severity meets webhook minimum severity
func (r *FraudReporter) meetsSeverity(alertSeverity, minSeverity string) bool {
	severityLevels := map[string]int{
		"low":      1,
		"medium":   2,
		"high":     3,
		"critical": 4,
	}

	alertLevel := severityLevels[alertSeverity]
	minLevel := severityLevels[minSeverity]

	return alertLevel >= minLevel
}
