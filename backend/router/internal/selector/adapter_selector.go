package selector

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/redis/go-redis/v9"
	log "github.com/sirupsen/logrus"
)

// AdapterInfo represents adapter configuration
type AdapterInfo struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Priority      int      `json:"priority"`
	Enabled       bool     `json:"enabled"`
	Regions       []string `json:"regions"`
	MinimumCPM    float64  `json:"minimum_cpm"`
	TimeoutMs     int      `json:"timeout_ms"`
	DailyCapacity int64    `json:"daily_capacity"`
	HealthScore   float64  `json:"health_score"` // 0.0-1.0
}

// AdapterSelector selects best adapters for ad request
type AdapterSelector struct {
	redis *redis.Client
}

// NewAdapterSelector creates a new adapter selector
func NewAdapterSelector(redisClient *redis.Client) *AdapterSelector {
	return &AdapterSelector{
		redis: redisClient,
	}
}

// SelectAdapters selects best adapters for a request
func (as *AdapterSelector) SelectAdapters(ctx context.Context, region string, adFormat string, maxAdapters int) ([]AdapterInfo, error) {
	// Get all adapters from cache
	adapters, err := as.getAllAdapters(ctx)
	if err != nil {
		return nil, err
	}

	// Filter adapters
	var eligible []AdapterInfo
	for _, adapter := range adapters {
		if !adapter.Enabled {
			continue
		}

		// Check region support
		if len(adapter.Regions) > 0 && !contains(adapter.Regions, region) && !contains(adapter.Regions, "*") {
			continue
		}

		// Check health score
		if adapter.HealthScore < 0.5 {
			log.WithFields(log.Fields{
				"adapter": adapter.ID,
				"health":  adapter.HealthScore,
			}).Debug("Skipping unhealthy adapter")
			continue
		}

		eligible = append(eligible, adapter)
	}

	// Sort by priority (higher first), then by health score
	sort.Slice(eligible, func(i, j int) bool {
		if eligible[i].Priority != eligible[j].Priority {
			return eligible[i].Priority > eligible[j].Priority
		}
		return eligible[i].HealthScore > eligible[j].HealthScore
	})

	// Limit to maxAdapters
	if len(eligible) > maxAdapters {
		eligible = eligible[:maxAdapters]
	}

	log.WithFields(log.Fields{
		"region":    region,
		"ad_format": adFormat,
		"eligible":  len(eligible),
		"max":       maxAdapters,
	}).Debug("Selected adapters")

	return eligible, nil
}

// GetAdapter gets adapter by ID
func (as *AdapterSelector) GetAdapter(ctx context.Context, adapterID string) (*AdapterInfo, error) {
	key := fmt.Sprintf("adapter:%s", adapterID)

	data, err := as.redis.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var adapter AdapterInfo
	if err := json.Unmarshal(data, &adapter); err != nil {
		return nil, err
	}

	return &adapter, nil
}

// UpdateAdapterHealth updates adapter health score
func (as *AdapterSelector) UpdateAdapterHealth(ctx context.Context, adapterID string, healthScore float64) error {
	adapter, err := as.GetAdapter(ctx, adapterID)
	if err != nil {
		return err
	}

	adapter.HealthScore = healthScore

	key := fmt.Sprintf("adapter:%s", adapterID)
	data, err := json.Marshal(adapter)
	if err != nil {
		return err
	}

	return as.redis.Set(ctx, key, data, 0).Err()
}

// RecordAdapterResponse records adapter response for health monitoring
func (as *AdapterSelector) RecordAdapterResponse(ctx context.Context, adapterID string, success bool, latencyMs int64) {
	// Update success rate
	successKey := fmt.Sprintf("adapter_success:%s", adapterID)
	if success {
		as.redis.Incr(ctx, successKey)
	}

	totalKey := fmt.Sprintf("adapter_total:%s", adapterID)
	as.redis.Incr(ctx, totalKey)

	// Update average latency
	latencyKey := fmt.Sprintf("adapter_latency:%s", adapterID)
	as.redis.LPush(ctx, latencyKey, latencyMs)
	as.redis.LTrim(ctx, latencyKey, 0, 99) // Keep last 100

	// Calculate health score
	go as.calculateHealthScore(context.Background(), adapterID)
}

// calculateHealthScore calculates adapter health score
func (as *AdapterSelector) calculateHealthScore(ctx context.Context, adapterID string) {
	successKey := fmt.Sprintf("adapter_success:%s", adapterID)
	totalKey := fmt.Sprintf("adapter_total:%s", adapterID)

	success, _ := as.redis.Get(ctx, successKey).Int64()
	total, _ := as.redis.Get(ctx, totalKey).Int64()

	if total == 0 {
		return
	}

	successRate := float64(success) / float64(total)

	// Get average latency
	latencyKey := fmt.Sprintf("adapter_latency:%s", adapterID)
	latencies, _ := as.redis.LRange(ctx, latencyKey, 0, -1).Result()

	avgLatency := 0.0
	if len(latencies) > 0 {
		sum := int64(0)
		for _, l := range latencies {
			var lat int64
			fmt.Sscanf(l, "%d", &lat)
			sum += lat
		}
		avgLatency = float64(sum) / float64(len(latencies))
	}

	// Calculate health score (weighted average)
	// 70% success rate, 30% latency (inverse)
	latencyScore := 1.0
	if avgLatency > 0 {
		// Score decreases as latency increases
		// Perfect score at 100ms, 0 score at 5000ms
		latencyScore = 1.0 - (avgLatency / 5000.0)
		if latencyScore < 0 {
			latencyScore = 0
		}
	}

	healthScore := (successRate * 0.7) + (latencyScore * 0.3)

	as.UpdateAdapterHealth(ctx, adapterID, healthScore)

	log.WithFields(log.Fields{
		"adapter":      adapterID,
		"success_rate": successRate,
		"avg_latency":  avgLatency,
		"health_score": healthScore,
	}).Debug("Updated adapter health")
}

// getAllAdapters gets all adapters from cache
func (as *AdapterSelector) getAllAdapters(ctx context.Context) ([]AdapterInfo, error) {
	// Scan for all adapter keys
	var cursor uint64
	var adapters []AdapterInfo

	for {
		keys, nextCursor, err := as.redis.Scan(ctx, cursor, "adapter:*", 100).Result()
		if err != nil {
			return nil, err
		}

		for _, key := range keys {
			data, err := as.redis.Get(ctx, key).Bytes()
			if err != nil {
				continue
			}

			var adapter AdapterInfo
			if err := json.Unmarshal(data, &adapter); err != nil {
				continue
			}

			adapters = append(adapters, adapter)
		}

		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	return adapters, nil
}

// Helper function
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
