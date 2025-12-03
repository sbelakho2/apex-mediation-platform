package waterfall

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/redis/go-redis/v9"
	log "github.com/sirupsen/logrus"
)

// WaterfallConfig represents waterfall configuration for a placement
type WaterfallConfig struct {
	PlacementID string          `json:"placement_id"`
	AdType      string          `json:"ad_type"`
	Tiers       []WaterfallTier `json:"tiers"`
	FloorCPM    float64         `json:"floor_cpm"`
	TimeoutMS   int             `json:"timeout_ms"`
}

// WaterfallTier represents a tier in the waterfall
type WaterfallTier struct {
	Priority    int     `json:"priority"`
	AdapterName string  `json:"adapter_name"`
	MinCPM      float64 `json:"min_cpm"`
	Weight      int     `json:"weight"` // For A/B testing
}

// WaterfallManager manages waterfall configurations
type WaterfallManager struct {
	redis *redis.Client
}

// NewWaterfallManager creates a new waterfall manager
func NewWaterfallManager(redisClient *redis.Client) *WaterfallManager {
	return &WaterfallManager{
		redis: redisClient,
	}
}

// GetWaterfall retrieves waterfall configuration for a placement
func (wm *WaterfallManager) GetWaterfall(ctx context.Context, placementID string) (*WaterfallConfig, error) {
	key := fmt.Sprintf("waterfall:%s", placementID)

	data, err := wm.redis.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return wm.getDefaultWaterfall(placementID), nil
	} else if err != nil {
		log.WithError(err).Error("Failed to fetch waterfall config")
		return nil, err
	}

	var config WaterfallConfig
	if err := json.Unmarshal(data, &config); err != nil {
		log.WithError(err).Error("Failed to unmarshal waterfall config")
		return nil, err
	}

	// Sort tiers by priority
	sort.Slice(config.Tiers, func(i, j int) bool {
		return config.Tiers[i].Priority < config.Tiers[j].Priority
	})

	return &config, nil
}

// SetWaterfall updates waterfall configuration
func (wm *WaterfallManager) SetWaterfall(ctx context.Context, config WaterfallConfig) error {
	key := fmt.Sprintf("waterfall:%s", config.PlacementID)

	data, err := json.Marshal(config)
	if err != nil {
		return err
	}

	return wm.redis.Set(ctx, key, data, 0).Err()
}

// OptimizeWaterfall adjusts waterfall based on performance data
func (wm *WaterfallManager) OptimizeWaterfall(ctx context.Context, placementID string) error {
	// Fetch performance metrics
	metrics, err := wm.getPerformanceMetrics(ctx, placementID)
	if err != nil {
		return err
	}

	// Get current waterfall
	waterfall, err := wm.GetWaterfall(ctx, placementID)
	if err != nil {
		return err
	}

	// Sort adapters by eCPM (revenue / impressions)
	sort.Slice(waterfall.Tiers, func(i, j int) bool {
		eCPM_i := metrics[waterfall.Tiers[i].AdapterName].ECPM
		eCPM_j := metrics[waterfall.Tiers[j].AdapterName].ECPM
		return eCPM_i > eCPM_j
	})

	// Update priorities
	for i := range waterfall.Tiers {
		waterfall.Tiers[i].Priority = i + 1
	}

	// Save optimized waterfall
	return wm.SetWaterfall(ctx, *waterfall)
}

// PerformanceMetrics represents adapter performance
type PerformanceMetrics struct {
	ECPM        float64
	FillRate    float64
	AvgLatency  int64
	Impressions int64
	Revenue     float64
}

// getPerformanceMetrics retrieves performance metrics for adapters
func (wm *WaterfallManager) getPerformanceMetrics(ctx context.Context, placementID string) (map[string]PerformanceMetrics, error) {
	// This would query Postgres rollups or the analytics service
	// For now, return mock data
	return map[string]PerformanceMetrics{
		"admob": {
			ECPM:        3.50,
			FillRate:    0.95,
			AvgLatency:  150,
			Impressions: 10000,
			Revenue:     35.00,
		},
		"applovin": {
			ECPM:        3.20,
			FillRate:    0.92,
			AvgLatency:  120,
			Impressions: 8000,
			Revenue:     25.60,
		},
	}, nil
}

// getDefaultWaterfall returns a default waterfall configuration
func (wm *WaterfallManager) getDefaultWaterfall(placementID string) *WaterfallConfig {
	return &WaterfallConfig{
		PlacementID: placementID,
		AdType:      "interstitial",
		FloorCPM:    0.50,
		TimeoutMS:   10000,
		Tiers: []WaterfallTier{
			{Priority: 1, AdapterName: "admob", MinCPM: 2.0, Weight: 100},
			{Priority: 2, AdapterName: "applovin", MinCPM: 1.5, Weight: 100},
			{Priority: 3, AdapterName: "ironsource", MinCPM: 1.0, Weight: 100},
			{Priority: 4, AdapterName: "unity", MinCPM: 0.5, Weight: 100},
		},
	}
}
