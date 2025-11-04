package ml

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	log "github.com/sirupsen/logrus"
)

// MLFraudDetector implements ML-based fraud detection
type MLFraudDetector struct {
	redis *redis.Client
	model *FraudModel
	mu    sync.RWMutex
}

// FraudModel represents a trained fraud detection model
type FraudModel struct {
	Version   string             `json:"version"`
	Weights   map[string]float64 `json:"weights"`
	Threshold float64            `json:"threshold"`
	Features  []string           `json:"features"`
	UpdatedAt time.Time          `json:"updated_at"`
}

// FeatureVector represents extracted features for ML model
type FeatureVector struct {
	// Device features
	DeviceAge      float64 `json:"device_age"`       // Days since first seen
	DeviceIPCount  float64 `json:"device_ip_count"`  // Unique IPs
	DeviceAppCount float64 `json:"device_app_count"` // Unique apps

	// Behavioral features
	ClickFrequency    float64 `json:"click_frequency"`     // Clicks per hour
	SessionDuration   float64 `json:"session_duration"`    // Avg session duration
	TimeBetweenClicks float64 `json:"time_between_clicks"` // Avg time between clicks

	// Temporal features
	HourOfDay float64 `json:"hour_of_day"` // 0-23
	DayOfWeek float64 `json:"day_of_week"` // 0-6
	IsWeekend float64 `json:"is_weekend"`  // 0 or 1

	// Network features
	IsDatacenter float64 `json:"is_datacenter"` // 0 or 1
	IsVPN        float64 `json:"is_vpn"`        // 0 or 1
	IsProxy      float64 `json:"is_proxy"`      // 0 or 1

	// User agent features
	UALength   float64 `json:"ua_length"`    // User agent length
	UAEntropy  float64 `json:"ua_entropy"`   // Shannon entropy
	IsMobileUA float64 `json:"is_mobile_ua"` // 0 or 1

	// Historical features
	HistoricalFraudRate float64 `json:"historical_fraud_rate"` // Past fraud rate
	ConversionRate      float64 `json:"conversion_rate"`       // Past conversion rate
}

// NewMLFraudDetector creates a new ML fraud detector
func NewMLFraudDetector(redisClient *redis.Client) *MLFraudDetector {
	detector := &MLFraudDetector{
		redis: redisClient,
	}

	// Try to load trained model from file
	model, err := loadTrainedModel()
	if err != nil {
		log.WithError(err).Warn("Failed to load trained model, using default")
		detector.model = loadDefaultModel()
	} else {
		detector.model = model
		log.WithField("version", model.Version).Info("Loaded trained fraud detection model")
	}

	return detector
}

// Predict predicts fraud score using ML model
func (mfd *MLFraudDetector) Predict(ctx context.Context, features FeatureVector) float64 {
	mfd.mu.RLock()
	defer mfd.mu.RUnlock()

	// Calculate weighted sum
	score := 0.0

	// Add bias if present in weights
	if bias, ok := mfd.model.Weights["_bias"]; ok {
		score = bias
	}

	// Add weighted features
	featureMap := map[string]float64{
		"device_age":            features.DeviceAge,
		"device_ip_count":       features.DeviceIPCount,
		"device_app_count":      features.DeviceAppCount,
		"click_frequency":       features.ClickFrequency,
		"session_duration":      features.SessionDuration,
		"time_between_clicks":   features.TimeBetweenClicks,
		"hour_of_day":           features.HourOfDay,
		"day_of_week":           features.DayOfWeek,
		"is_weekend":            features.IsWeekend,
		"is_datacenter":         features.IsDatacenter,
		"is_vpn":                features.IsVPN,
		"is_proxy":              features.IsProxy,
		"ua_length":             features.UALength,
		"ua_entropy":            features.UAEntropy,
		"is_mobile_ua":          features.IsMobileUA,
		"historical_fraud_rate": features.HistoricalFraudRate,
		"conversion_rate":       features.ConversionRate,
	}

	for feature, value := range featureMap {
		if weight, ok := mfd.model.Weights[feature]; ok {
			score += weight * value
		}
	}

	// Apply sigmoid activation to get probability [0, 1]
	probability := 1.0 / (1.0 + math.Exp(-score))

	return probability
}

// ExtractFeatures extracts features from request data
func (mfd *MLFraudDetector) ExtractFeatures(ctx context.Context, deviceID, ip, userAgent string) FeatureVector {
	features := FeatureVector{}

	// Device features
	features.DeviceAge = mfd.getDeviceAge(ctx, deviceID)
	features.DeviceIPCount = mfd.getDeviceIPCount(ctx, deviceID)
	features.DeviceAppCount = mfd.getDeviceAppCount(ctx, deviceID)

	// Behavioral features
	features.ClickFrequency = mfd.getClickFrequency(ctx, deviceID)
	features.SessionDuration = mfd.getAvgSessionDuration(ctx, deviceID)
	features.TimeBetweenClicks = mfd.getAvgTimeBetweenClicks(ctx, deviceID)

	// Temporal features
	now := time.Now()
	features.HourOfDay = float64(now.Hour())
	features.DayOfWeek = float64(now.Weekday())
	if now.Weekday() == time.Saturday || now.Weekday() == time.Sunday {
		features.IsWeekend = 1.0
	}

	// Network features
	features.IsDatacenter = mfd.checkDatacenter(ip)
	features.IsVPN = mfd.checkVPN(ctx, ip)
	features.IsProxy = mfd.checkProxy(ctx, ip)

	// User agent features
	features.UALength = float64(len(userAgent))
	features.UAEntropy = calculateEntropy(userAgent)
	if containsMobileKeywords(userAgent) {
		features.IsMobileUA = 1.0
	}

	// Historical features
	features.HistoricalFraudRate = mfd.getHistoricalFraudRate(ctx, deviceID)
	features.ConversionRate = mfd.getConversionRate(ctx, deviceID)

	return features
}

// UpdateModel updates the fraud detection model
func (mfd *MLFraudDetector) UpdateModel(model FraudModel) {
	mfd.mu.Lock()
	defer mfd.mu.Unlock()

	mfd.model = &model

	// Cache model in Redis
	data, _ := json.Marshal(model)
	mfd.redis.Set(context.Background(), "fraud_model:latest", data, 0)

	log.WithField("version", model.Version).Info("Updated fraud detection model")
}

// Feature extraction helpers

func (mfd *MLFraudDetector) getDeviceAge(ctx context.Context, deviceID string) float64 {
	key := "device_first_seen:" + deviceID
	timestamp, err := mfd.redis.Get(ctx, key).Int64()
	if err != nil {
		// First time seeing device, set timestamp
		now := time.Now().Unix()
		mfd.redis.Set(ctx, key, now, 0)
		return 0.0
	}

	firstSeen := time.Unix(timestamp, 0)
	days := time.Since(firstSeen).Hours() / 24
	return days
}

func (mfd *MLFraudDetector) getDeviceIPCount(ctx context.Context, deviceID string) float64 {
	key := "device_ips:" + deviceID
	count, err := mfd.redis.SCard(ctx, key).Result()
	if err != nil {
		return 0.0
	}
	return float64(count)
}

func (mfd *MLFraudDetector) getDeviceAppCount(ctx context.Context, deviceID string) float64 {
	key := "device_apps:" + deviceID
	count, err := mfd.redis.SCard(ctx, key).Result()
	if err != nil {
		return 0.0
	}
	return float64(count)
}

func (mfd *MLFraudDetector) getClickFrequency(ctx context.Context, deviceID string) float64 {
	key := "click_count_1h:" + deviceID
	count, err := mfd.redis.Get(ctx, key).Int64()
	if err != nil {
		return 0.0
	}
	return float64(count)
}

func (mfd *MLFraudDetector) getAvgSessionDuration(ctx context.Context, deviceID string) float64 {
	key := "avg_session_duration:" + deviceID
	duration, err := mfd.redis.Get(ctx, key).Float64()
	if err != nil {
		return 0.0
	}
	return duration
}

func (mfd *MLFraudDetector) getAvgTimeBetweenClicks(ctx context.Context, deviceID string) float64 {
	key := "avg_time_between_clicks:" + deviceID
	avgTime, err := mfd.redis.Get(ctx, key).Float64()
	if err != nil {
		return 0.0
	}
	return avgTime
}

func (mfd *MLFraudDetector) checkDatacenter(ip string) float64 {
	// Simplified check - in production, use IP intelligence service
	// For now, assume non-datacenter
	return 0.0
}

func (mfd *MLFraudDetector) checkVPN(ctx context.Context, ip string) float64 {
	// Check VPN database
	key := "vpn_ip:" + ip
	exists, err := mfd.redis.Exists(ctx, key).Result()
	if err == nil && exists > 0 {
		return 1.0
	}
	return 0.0
}

func (mfd *MLFraudDetector) checkProxy(ctx context.Context, ip string) float64 {
	// Check proxy database
	key := "proxy_ip:" + ip
	exists, err := mfd.redis.Exists(ctx, key).Result()
	if err == nil && exists > 0 {
		return 1.0
	}
	return 0.0
}

func (mfd *MLFraudDetector) getHistoricalFraudRate(ctx context.Context, deviceID string) float64 {
	key := "fraud_rate:" + deviceID
	rate, err := mfd.redis.Get(ctx, key).Float64()
	if err != nil {
		return 0.0
	}
	return rate
}

func (mfd *MLFraudDetector) getConversionRate(ctx context.Context, deviceID string) float64 {
	key := "conversion_rate:" + deviceID
	rate, err := mfd.redis.Get(ctx, key).Float64()
	if err != nil {
		return 0.0
	}
	return rate
}

// Helper functions

func sigmoid(x float64) float64 {
	return 1.0 / (1.0 + math.Exp(-x))
}

func calculateEntropy(s string) float64 {
	if len(s) == 0 {
		return 0.0
	}

	freq := make(map[rune]int)
	for _, c := range s {
		freq[c]++
	}

	entropy := 0.0
	length := float64(len(s))

	for _, count := range freq {
		p := float64(count) / length
		entropy -= p * math.Log2(p)
	}

	return entropy
}

func containsMobileKeywords(userAgent string) bool {
	keywords := []string{"Mobile", "Android", "iPhone", "iPad", "iOS"}
	for _, keyword := range keywords {
		if containsIgnoreCase(userAgent, keyword) {
			return true
		}
	}
	return false
}

func containsIgnoreCase(s, substr string) bool {
	return len(s) >= len(substr) &&
		(s == substr || len(s) > 0 && containsIgnoreCase(s[1:], substr) ||
			(len(s) >= len(substr) && equalFold(s[:len(substr)], substr)))
}

func equalFold(s, t string) bool {
	if len(s) != len(t) {
		return false
	}
	for i := 0; i < len(s); i++ {
		if toLower(s[i]) != toLower(t[i]) {
			return false
		}
	}
	return true
}

func toLower(c byte) byte {
	if c >= 'A' && c <= 'Z' {
		return c + 32
	}
	return c
}

// loadDefaultModel loads default fraud detection model
func loadDefaultModel() *FraudModel {
	return &FraudModel{
		Version:   "1.0.0",
		Threshold: 0.7,
		Weights: map[string]float64{
			"device_age":            -0.05, // Older devices less likely fraud
			"device_ip_count":       0.15,  // Many IPs = suspicious
			"device_app_count":      -0.02, // Many apps = legitimate user
			"click_frequency":       0.20,  // High frequency = suspicious
			"session_duration":      -0.10, // Longer sessions = legitimate
			"time_between_clicks":   -0.15, // Longer time = legitimate
			"hour_of_day":           0.01,  // Slight weight for time
			"day_of_week":           0.01,  // Slight weight for day
			"is_weekend":            0.05,  // Weekend slightly suspicious
			"is_datacenter":         0.80,  // Strong indicator
			"is_vpn":                0.40,  // Moderate indicator
			"is_proxy":              0.50,  // Strong indicator
			"ua_length":             -0.01, // Shorter UA = suspicious
			"ua_entropy":            -0.05, // Lower entropy = suspicious
			"is_mobile_ua":          -0.20, // Mobile = more legitimate
			"historical_fraud_rate": 0.90,  // Very strong indicator
			"conversion_rate":       -0.30, // High conversion = legitimate
		},
		UpdatedAt: time.Now(),
	}
}

// loadTrainedModel loads the trained model from file
func loadTrainedModel() (*FraudModel, error) {
	// Try to load from current directory first (for production)
	modelPath := "trained_fraud_model.json"

	data, err := os.ReadFile(modelPath)
	if err != nil {
		// If not found, return error to fall back to default
		return nil, err
	}

	var trainedModel struct {
		Version   string             `json:"version"`
		Weights   map[string]float64 `json:"weights"`
		Bias      float64            `json:"bias"`
		Threshold float64            `json:"threshold"`
		Features  []string           `json:"features"`
		UpdatedAt time.Time          `json:"updated_at"`
	}

	if err := json.Unmarshal(data, &trainedModel); err != nil {
		return nil, err
	}

	// Convert to FraudModel format (combine bias into weights)
	weights := make(map[string]float64)
	for k, v := range trainedModel.Weights {
		weights[k] = v
	}
	// Store bias separately (handled in Predict function)
	weights["_bias"] = trainedModel.Bias

	model := &FraudModel{
		Version:   trainedModel.Version,
		Weights:   weights,
		Threshold: trainedModel.Threshold,
		Features:  trainedModel.Features,
		UpdatedAt: trainedModel.UpdatedAt,
	}

	return model, nil
}

// AnomalyDetector detects anomalies in traffic patterns
type AnomalyDetector struct {
	redis *redis.Client
}

// NewAnomalyDetector creates a new anomaly detector
func NewAnomalyDetector(redisClient *redis.Client) *AnomalyDetector {
	return &AnomalyDetector{
		redis: redisClient,
	}
}

// DetectAnomaly detects anomalies in request patterns
func (ad *AnomalyDetector) DetectAnomaly(ctx context.Context, metric string, value float64) bool {
	key := "metric_stats:" + metric

	// Get historical mean and stddev
	mean, _ := ad.redis.HGet(ctx, key, "mean").Float64()
	stddev, _ := ad.redis.HGet(ctx, key, "stddev").Float64()

	// If no historical data, not anomalous
	if stddev == 0 {
		ad.updateStats(ctx, key, value)
		return false
	}

	// Z-score threshold of 3 (99.7% confidence)
	zscore := math.Abs(value-mean) / stddev
	isAnomaly := zscore > 3.0

	// Update stats
	ad.updateStats(ctx, key, value)

	return isAnomaly
}

func (ad *AnomalyDetector) updateStats(ctx context.Context, key string, value float64) {
	// Simple exponential moving average
	alpha := 0.1 // Smoothing factor

	mean, _ := ad.redis.HGet(ctx, key, "mean").Float64()
	newMean := alpha*value + (1-alpha)*mean

	variance, _ := ad.redis.HGet(ctx, key, "variance").Float64()
	newVariance := alpha*math.Pow(value-newMean, 2) + (1-alpha)*variance
	newStddev := math.Sqrt(newVariance)

	ad.redis.HSet(ctx, key, "mean", newMean)
	ad.redis.HSet(ctx, key, "variance", newVariance)
	ad.redis.HSet(ctx, key, "stddev", newStddev)
}
