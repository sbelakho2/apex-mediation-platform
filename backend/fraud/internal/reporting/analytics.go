package reporting

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// FraudAnalytics provides fraud analytics aggregation
type FraudAnalytics struct {
	redis *redis.Client
}

// NewFraudAnalytics creates a new fraud analytics instance
func NewFraudAnalytics(redisClient *redis.Client) *FraudAnalytics {
	return &FraudAnalytics{
		redis: redisClient,
	}
}

// TimeSeriesData represents fraud metrics over time
type TimeSeriesData struct {
	Timestamp    time.Time `json:"timestamp"`
	FraudCount   int64     `json:"fraud_count"`
	TotalCount   int64     `json:"total_count"`
	FraudRate    float64   `json:"fraud_rate"`
	GIVTCount    int64     `json:"givt_count"`
	SIVTCount    int64     `json:"sivt_count"`
	MLCount      int64     `json:"ml_count"`
	AnomalyCount int64     `json:"anomaly_count"`
	BlockedCount int64     `json:"blocked_count"`
}

// FraudTrend represents fraud trend analysis
type FraudTrend struct {
	PublisherID      string           `json:"publisher_id"`
	TimeRange        TimeRange        `json:"time_range"`
	DataPoints       []TimeSeriesData `json:"data_points"`
	TrendDirection   string           `json:"trend_direction"` // increasing, decreasing, stable
	PercentageChange float64          `json:"percentage_change"`
	AlertLevel       string           `json:"alert_level"` // normal, warning, critical
}

type TimeRange struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

// TopFrausters represents publishers/advertisers with highest fraud
type TopFrausters struct {
	EntityType string           `json:"entity_type"` // publisher, advertiser
	TimeWindow string           `json:"time_window"`
	Entities   []FraudsterEntry `json:"entities"`
}

type FraudsterEntry struct {
	EntityID      string  `json:"entity_id"`
	FraudCount    int64   `json:"fraud_count"`
	TotalRequests int64   `json:"total_requests"`
	FraudRate     float64 `json:"fraud_rate"`
	IsBlocked     bool    `json:"is_blocked"`
}

// FraudPattern represents detected fraud patterns
type FraudPattern struct {
	PatternID   string                 `json:"pattern_id"`
	PatternType string                 `json:"pattern_type"` // click_farm, bot_network, device_farm
	DetectedAt  time.Time              `json:"detected_at"`
	Confidence  float64                `json:"confidence"`
	AffectedIPs []string               `json:"affected_ips"`
	AffectedIDs []string               `json:"affected_device_ids"`
	Indicators  map[string]interface{} `json:"indicators"`
	Severity    string                 `json:"severity"`
	Description string                 `json:"description"`
}

// GetFraudTrend retrieves fraud trend analysis for a publisher
func (a *FraudAnalytics) GetFraudTrend(ctx context.Context, publisherID string, startTime, endTime time.Time, granularity string) (*FraudTrend, error) {
	// Determine bucket size based on granularity (hourly, daily, weekly)
	var bucketSize time.Duration
	switch granularity {
	case "hourly":
		bucketSize = time.Hour
	case "daily":
		bucketSize = 24 * time.Hour
	case "weekly":
		bucketSize = 7 * 24 * time.Hour
	default:
		return nil, fmt.Errorf("invalid granularity: %s", granularity)
	}

	dataPoints := []TimeSeriesData{}
	currentTime := startTime

	for currentTime.Before(endTime) {
		bucketEnd := currentTime.Add(bucketSize)
		if bucketEnd.After(endTime) {
			bucketEnd = endTime
		}

		// Get stats for this time bucket
		statsKey := fmt.Sprintf("fraud:timeseries:%s:%d", publisherID, currentTime.Unix()/int64(bucketSize.Seconds()))
		data, err := a.redis.Get(ctx, statsKey).Bytes()

		var point TimeSeriesData
		if err == redis.Nil {
			// No data for this bucket
			point = TimeSeriesData{
				Timestamp: currentTime,
			}
		} else if err != nil {
			return nil, fmt.Errorf("failed to get timeseries data: %w", err)
		} else {
			if err := json.Unmarshal(data, &point); err != nil {
				return nil, fmt.Errorf("failed to unmarshal data: %w", err)
			}
		}

		dataPoints = append(dataPoints, point)
		currentTime = bucketEnd
	}

	// Calculate trend
	trend := &FraudTrend{
		PublisherID: publisherID,
		TimeRange: TimeRange{
			Start: startTime,
			End:   endTime,
		},
		DataPoints: dataPoints,
	}

	if len(dataPoints) >= 2 {
		firstRate := dataPoints[0].FraudRate
		lastRate := dataPoints[len(dataPoints)-1].FraudRate

		if lastRate > firstRate*1.2 {
			trend.TrendDirection = "increasing"
			trend.AlertLevel = "warning"
		} else if lastRate < firstRate*0.8 {
			trend.TrendDirection = "decreasing"
			trend.AlertLevel = "normal"
		} else {
			trend.TrendDirection = "stable"
			trend.AlertLevel = "normal"
		}

		if firstRate > 0 {
			trend.PercentageChange = ((lastRate - firstRate) / firstRate) * 100
		}

		// Critical alert if fraud rate > 10%
		if lastRate > 0.10 {
			trend.AlertLevel = "critical"
		}
	}

	return trend, nil
}

// RecordTimeSeriesData records fraud metrics for a time bucket
func (a *FraudAnalytics) RecordTimeSeriesData(ctx context.Context, publisherID string, timestamp time.Time, data TimeSeriesData) error {
	// Determine bucket based on hour
	bucketSize := time.Hour
	bucketTimestamp := timestamp.Truncate(bucketSize)
	data.Timestamp = bucketTimestamp

	// Calculate fraud rate
	if data.TotalCount > 0 {
		data.FraudRate = float64(data.FraudCount) / float64(data.TotalCount)
	}

	statsKey := fmt.Sprintf("fraud:timeseries:%s:%d", publisherID, bucketTimestamp.Unix()/int64(bucketSize.Seconds()))

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal timeseries data: %w", err)
	}

	// Store with 30 day TTL
	if err := a.redis.Set(ctx, statsKey, dataBytes, 30*24*time.Hour).Err(); err != nil {
		return fmt.Errorf("failed to store timeseries data: %w", err)
	}

	return nil
}

// GetTopFrausters retrieves top fraudulent publishers or advertisers
func (a *FraudAnalytics) GetTopFrausters(ctx context.Context, entityType string, timeWindow string, limit int) (*TopFrausters, error) {
	// Get fraud stats for all entities
	pattern := fmt.Sprintf("fraud:stats:*:%s", timeWindow)
	keys, err := a.redis.Keys(ctx, pattern).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get stats keys: %w", err)
	}

	entries := []FraudsterEntry{}

	for _, key := range keys {
		data, err := a.redis.Get(ctx, key).Bytes()
		if err != nil {
			continue
		}

		var stats FraudStats
		if err := json.Unmarshal(data, &stats); err != nil {
			continue
		}

		// Only include entities with significant fraud
		if stats.FraudRate > 0.01 && stats.TotalRequests > 100 {
			entry := FraudsterEntry{
				EntityID:      stats.PublisherID,
				FraudCount:    stats.FraudRequests,
				TotalRequests: stats.TotalRequests,
				FraudRate:     stats.FraudRate,
			}
			entries = append(entries, entry)
		}
	}

	// Sort by fraud rate (descending)
	for i := 0; i < len(entries); i++ {
		for j := i + 1; j < len(entries); j++ {
			if entries[j].FraudRate > entries[i].FraudRate {
				entries[i], entries[j] = entries[j], entries[i]
			}
		}
	}

	// Limit results
	if len(entries) > limit {
		entries = entries[:limit]
	}

	return &TopFrausters{
		EntityType: entityType,
		TimeWindow: timeWindow,
		Entities:   entries,
	}, nil
}

// DetectFraudPattern detects fraud patterns using heuristics
func (a *FraudAnalytics) DetectFraudPattern(ctx context.Context, publisherID string) ([]FraudPattern, error) {
	patterns := []FraudPattern{}

	// Pattern 1: Click farm detection (many requests from few IPs)
	ipCountKey := fmt.Sprintf("fraud:pattern:ip_count:%s", publisherID)
	ipCount, err := a.redis.SCard(ctx, ipCountKey).Result()
	if err == nil {
		requestCountKey := fmt.Sprintf("fraud:pattern:request_count:%s", publisherID)
		requestCount, err := a.redis.Get(ctx, requestCountKey).Int64()
		if err == nil && ipCount > 0 {
			requestsPerIP := float64(requestCount) / float64(ipCount)
			if requestsPerIP > 100 {
				pattern := FraudPattern{
					PatternID:   fmt.Sprintf("click_farm_%s_%d", publisherID, time.Now().Unix()),
					PatternType: "click_farm",
					DetectedAt:  time.Now(),
					Confidence:  0.85,
					Indicators: map[string]interface{}{
						"requests_per_ip": requestsPerIP,
						"unique_ips":      ipCount,
						"total_requests":  requestCount,
					},
					Severity:    "high",
					Description: "Detected high concentration of requests from few IP addresses",
				}
				patterns = append(patterns, pattern)
			}
		}
	}

	// Pattern 2: Bot network detection (regular timing intervals)
	timingKey := fmt.Sprintf("fraud:pattern:timing:%s", publisherID)
	timestamps, err := a.redis.ZRange(ctx, timingKey, 0, 100).Result()
	if err == nil && len(timestamps) > 10 {
		intervals := []int64{}
		for i := 1; i < len(timestamps); i++ {
			// Parse timestamps and calculate intervals
			// Simplified for now
		}
		// If intervals are too regular, it's likely a bot
		if len(intervals) > 0 {
			// Calculate variance
			// If variance is low, pattern detected
		}
	}

	// Pattern 3: Device farm detection (many device IDs from same IP)
	deviceFarmKey := fmt.Sprintf("fraud:pattern:device_farm:%s", publisherID)
	deviceCount, err := a.redis.HLen(ctx, deviceFarmKey).Result()
	if err == nil && deviceCount > 50 {
		pattern := FraudPattern{
			PatternID:   fmt.Sprintf("device_farm_%s_%d", publisherID, time.Now().Unix()),
			PatternType: "device_farm",
			DetectedAt:  time.Now(),
			Confidence:  0.75,
			Indicators: map[string]interface{}{
				"unique_devices": deviceCount,
			},
			Severity:    "medium",
			Description: "Detected unusually high number of device IDs from limited IP addresses",
		}
		patterns = append(patterns, pattern)
	}

	return patterns, nil
}

// GetDashboardData retrieves comprehensive fraud dashboard data
func (a *FraudAnalytics) GetDashboardData(ctx context.Context, publisherID string) (map[string]interface{}, error) {
	dashboard := make(map[string]interface{})

	// Get 24h stats
	stats24h, err := a.redis.Get(ctx, fmt.Sprintf("fraud:stats:%s:24h", publisherID)).Bytes()
	if err == nil {
		var stats FraudStats
		if err := json.Unmarshal(stats24h, &stats); err == nil {
			dashboard["stats_24h"] = stats
		}
	}

	// Get 7d stats
	stats7d, err := a.redis.Get(ctx, fmt.Sprintf("fraud:stats:%s:7d", publisherID)).Bytes()
	if err == nil {
		var stats FraudStats
		if err := json.Unmarshal(stats7d, &stats); err == nil {
			dashboard["stats_7d"] = stats
		}
	}

	// Get recent alerts
	alertsKey := fmt.Sprintf("fraud:alerts:publisher:%s", publisherID)
	alertIDs, err := a.redis.ZRevRange(ctx, alertsKey, 0, 9).Result()
	if err == nil {
		dashboard["recent_alerts"] = len(alertIDs)
	}

	// Get blocked entities count
	blockedPublishers, _ := a.redis.ZCard(ctx, "fraud:blocks:publisher").Result()
	blockedIPs, _ := a.redis.ZCard(ctx, "fraud:blocks:ip").Result()
	blockedDevices, _ := a.redis.ZCard(ctx, "fraud:blocks:device").Result()

	dashboard["blocked_entities"] = map[string]interface{}{
		"publishers": blockedPublishers,
		"ips":        blockedIPs,
		"devices":    blockedDevices,
	}

	// Get fraud patterns
	patterns, err := a.DetectFraudPattern(ctx, publisherID)
	if err == nil {
		dashboard["detected_patterns"] = len(patterns)
		dashboard["patterns"] = patterns
	}

	// Get trend
	endTime := time.Now()
	startTime := endTime.Add(-24 * time.Hour)
	trend, err := a.GetFraudTrend(ctx, publisherID, startTime, endTime, "hourly")
	if err == nil {
		dashboard["fraud_trend"] = trend
	}

	return dashboard, nil
}
