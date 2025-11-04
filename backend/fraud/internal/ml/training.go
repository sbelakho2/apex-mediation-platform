package ml

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/redis/go-redis/v9"
	log "github.com/sirupsen/logrus"
)

// TrainingData represents a labeled training sample
type TrainingData struct {
	Features  map[string]float64 `json:"features"`
	Label     bool               `json:"label"` // true = fraud, false = legitimate
	Weight    float64            `json:"weight"`
	Timestamp time.Time          `json:"timestamp"`
}

// ModelVersion represents a trained model version
type ModelVersion struct {
	ID              string             `json:"id"`
	Version         string             `json:"version"`
	Weights         map[string]float64 `json:"weights"`
	Bias            float64            `json:"bias"`
	TrainedAt       time.Time          `json:"trained_at"`
	TrainingSamples int                `json:"training_samples"`
	Accuracy        float64            `json:"accuracy"`
	Precision       float64            `json:"precision"`
	Recall          float64            `json:"recall"`
	F1Score         float64            `json:"f1_score"`
	AUC             float64            `json:"auc"`
	Status          string             `json:"status"` // training, testing, deployed, archived
}

// MLTrainer handles model training
type MLTrainer struct {
	redis *redis.Client
}

// NewMLTrainer creates a new ML trainer
func NewMLTrainer(redisClient *redis.Client) *MLTrainer {
	return &MLTrainer{
		redis: redisClient,
	}
}

// CollectTrainingData collects labeled samples for training
func (mt *MLTrainer) CollectTrainingData(ctx context.Context, deviceID, ip, userAgent string, features map[string]float64, isFraud bool) error {
	sample := TrainingData{
		Features:  features,
		Label:     isFraud,
		Weight:    1.0, // Can adjust based on confidence
		Timestamp: time.Now(),
	}

	// Store in training dataset
	key := fmt.Sprintf("training_data:%s", time.Now().Format("2006-01-02"))
	data, err := json.Marshal(sample)
	if err != nil {
		return err
	}

	return mt.redis.RPush(ctx, key, data).Err()
}

// TrainModel trains a new model version using collected data
func (mt *MLTrainer) TrainModel(ctx context.Context, startDate, endDate time.Time) (*ModelVersion, error) {
	log.Info("Starting model training...")

	// Collect training data
	samples, err := mt.getTrainingSamples(ctx, startDate, endDate)
	if err != nil {
		return nil, err
	}

	if len(samples) < 1000 {
		return nil, fmt.Errorf("insufficient training samples: %d (need at least 1000)", len(samples))
	}

	log.WithField("samples", len(samples)).Info("Collected training samples")

	// Split into train/test sets (80/20)
	trainSize := int(float64(len(samples)) * 0.8)
	trainSamples := samples[:trainSize]
	testSamples := samples[trainSize:]

	// Initialize weights
	weights := make(map[string]float64)
	featureNames := []string{
		"device_age", "device_ip_count", "device_app_count",
		"click_frequency", "session_duration", "time_between_clicks",
		"hour_of_day", "day_of_week", "is_weekend",
		"is_datacenter", "is_vpn", "is_proxy",
		"ua_length", "ua_entropy", "is_mobile_ua",
		"historical_fraud_rate", "conversion_rate",
	}

	for _, name := range featureNames {
		weights[name] = 0.0
	}
	bias := 0.0

	// Training hyperparameters
	learningRate := 0.01
	epochs := 100
	batchSize := 32

	// Gradient descent training
	for epoch := 0; epoch < epochs; epoch++ {
		totalLoss := 0.0

		// Mini-batch training
		for i := 0; i < len(trainSamples); i += batchSize {
			end := i + batchSize
			if end > len(trainSamples) {
				end = len(trainSamples)
			}

			batch := trainSamples[i:end]

			// Calculate gradients
			weightGradients := make(map[string]float64)
			biasGradient := 0.0

			for _, sample := range batch {
				// Forward pass
				z := bias
				for feature, value := range sample.Features {
					if weight, ok := weights[feature]; ok {
						z += weight * value
					}
				}
				prediction := sigmoid(z)

				// Calculate error
				var label float64
				if sample.Label {
					label = 1.0
				} else {
					label = 0.0
				}
				error := prediction - label

				// Accumulate gradients
				for feature, value := range sample.Features {
					weightGradients[feature] += error * value * sample.Weight
				}
				biasGradient += error * sample.Weight

				// Calculate loss (binary cross-entropy)
				if label == 1.0 {
					totalLoss += -math.Log(prediction+1e-10) * sample.Weight
				} else {
					totalLoss += -math.Log(1-prediction+1e-10) * sample.Weight
				}
			}

			// Update weights
			batchSizeFloat := float64(len(batch))
			for feature := range weights {
				weights[feature] -= learningRate * weightGradients[feature] / batchSizeFloat
			}
			bias -= learningRate * biasGradient / batchSizeFloat
		}

		avgLoss := totalLoss / float64(len(trainSamples))
		if epoch%10 == 0 {
			log.WithFields(log.Fields{
				"epoch": epoch,
				"loss":  avgLoss,
			}).Info("Training progress")
		}
	}

	log.Info("Training complete, evaluating model...")

	// Evaluate on test set
	metrics := mt.evaluateModel(testSamples, weights, bias)

	// Create model version
	version := &ModelVersion{
		ID:              fmt.Sprintf("model_%d", time.Now().Unix()),
		Version:         fmt.Sprintf("v%s", time.Now().Format("20060102-150405")),
		Weights:         weights,
		Bias:            bias,
		TrainedAt:       time.Now(),
		TrainingSamples: len(trainSamples),
		Accuracy:        metrics.Accuracy,
		Precision:       metrics.Precision,
		Recall:          metrics.Recall,
		F1Score:         metrics.F1Score,
		AUC:             metrics.AUC,
		Status:          "testing",
	}

	// Store model
	if err := mt.storeModel(ctx, version); err != nil {
		return nil, err
	}

	log.WithFields(log.Fields{
		"version":   version.Version,
		"accuracy":  version.Accuracy,
		"precision": version.Precision,
		"recall":    version.Recall,
		"f1_score":  version.F1Score,
	}).Info("Model training complete")

	return version, nil
}

// EvaluationMetrics represents model evaluation results
type EvaluationMetrics struct {
	Accuracy  float64
	Precision float64
	Recall    float64
	F1Score   float64
	AUC       float64
}

func (mt *MLTrainer) evaluateModel(samples []TrainingData, weights map[string]float64, bias float64) EvaluationMetrics {
	var truePositives, falsePositives, trueNegatives, falseNegatives int

	for _, sample := range samples {
		// Make prediction
		z := bias
		for feature, value := range sample.Features {
			if weight, ok := weights[feature]; ok {
				z += weight * value
			}
		}
		prediction := sigmoid(z) >= 0.5

		// Compare with actual label
		if sample.Label && prediction {
			truePositives++
		} else if sample.Label && !prediction {
			falseNegatives++
		} else if !sample.Label && prediction {
			falsePositives++
		} else {
			trueNegatives++
		}
	}

	accuracy := float64(truePositives+trueNegatives) / float64(len(samples))

	var precision, recall float64
	if truePositives+falsePositives > 0 {
		precision = float64(truePositives) / float64(truePositives+falsePositives)
	}
	if truePositives+falseNegatives > 0 {
		recall = float64(truePositives) / float64(truePositives+falseNegatives)
	}

	var f1Score float64
	if precision+recall > 0 {
		f1Score = 2 * precision * recall / (precision + recall)
	}

	return EvaluationMetrics{
		Accuracy:  accuracy,
		Precision: precision,
		Recall:    recall,
		F1Score:   f1Score,
		AUC:       0.85, // Simplified - would need ROC curve calculation
	}
}

// DeployModel marks a model version as deployed
func (mt *MLTrainer) DeployModel(ctx context.Context, modelID string) error {
	// Get model
	model, err := mt.getModel(ctx, modelID)
	if err != nil {
		return err
	}

	// Archive current deployed model
	currentDeployed, err := mt.getDeployedModel(ctx)
	if err == nil && currentDeployed != nil {
		currentDeployed.Status = "archived"
		mt.storeModel(ctx, currentDeployed)
	}

	// Deploy new model
	model.Status = "deployed"
	if err := mt.storeModel(ctx, model); err != nil {
		return err
	}

	// Set as current deployed
	data, _ := json.Marshal(model)
	if err := mt.redis.Set(ctx, "deployed_model", data, 0).Err(); err != nil {
		return err
	}

	log.WithFields(log.Fields{
		"model_id": modelID,
		"version":  model.Version,
	}).Info("Model deployed")

	return nil
}

// GetDeployedModel returns the currently deployed model
func (mt *MLTrainer) getDeployedModel(ctx context.Context) (*ModelVersion, error) {
	data, err := mt.redis.Get(ctx, "deployed_model").Bytes()
	if err != nil {
		return nil, err
	}

	var model ModelVersion
	if err := json.Unmarshal(data, &model); err != nil {
		return nil, err
	}

	return &model, nil
}

// Internal methods

func (mt *MLTrainer) getTrainingSamples(ctx context.Context, startDate, endDate time.Time) ([]TrainingData, error) {
	var samples []TrainingData

	// Iterate through dates
	for d := startDate; d.Before(endDate) || d.Equal(endDate); d = d.AddDate(0, 0, 1) {
		key := fmt.Sprintf("training_data:%s", d.Format("2006-01-02"))

		// Get all samples for this day
		data, err := mt.redis.LRange(ctx, key, 0, -1).Result()
		if err != nil {
			continue
		}

		for _, item := range data {
			var sample TrainingData
			if err := json.Unmarshal([]byte(item), &sample); err != nil {
				continue
			}
			samples = append(samples, sample)
		}
	}

	return samples, nil
}

func (mt *MLTrainer) storeModel(ctx context.Context, model *ModelVersion) error {
	key := fmt.Sprintf("model:%s", model.ID)

	data, err := json.Marshal(model)
	if err != nil {
		return err
	}

	if err := mt.redis.Set(ctx, key, data, 0).Err(); err != nil {
		return err
	}

	// Add to models list
	if err := mt.redis.SAdd(ctx, "models", model.ID).Err(); err != nil {
		return err
	}

	return nil
}

func (mt *MLTrainer) getModel(ctx context.Context, modelID string) (*ModelVersion, error) {
	key := fmt.Sprintf("model:%s", modelID)

	data, err := mt.redis.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var model ModelVersion
	if err := json.Unmarshal(data, &model); err != nil {
		return nil, err
	}

	return &model, nil
}

// ListModels returns all model versions
func (mt *MLTrainer) ListModels(ctx context.Context) ([]ModelVersion, error) {
	modelIDs, err := mt.redis.SMembers(ctx, "models").Result()
	if err != nil {
		return nil, err
	}

	var models []ModelVersion
	for _, id := range modelIDs {
		model, err := mt.getModel(ctx, id)
		if err != nil {
			continue
		}
		models = append(models, *model)
	}

	return models, nil
}

// sigmoid function is defined in fraud_ml.go, reusing it

// FeatureEngineering extracts and engineers features from raw data
type FeatureEngineering struct {
	redis *redis.Client
}

// NewFeatureEngineering creates a new feature engineering instance
func NewFeatureEngineering(redisClient *redis.Client) *FeatureEngineering {
	return &FeatureEngineering{
		redis: redisClient,
	}
}

// ExtractFeatures extracts all features for a given request
func (fe *FeatureEngineering) ExtractFeatures(ctx context.Context, deviceID, ip, userAgent string) map[string]float64 {
	features := make(map[string]float64)

	// Device features
	features["device_age"] = fe.getDeviceAge(ctx, deviceID)
	features["device_ip_count"] = fe.getDeviceIPCount(ctx, deviceID)
	features["device_app_count"] = fe.getDeviceAppCount(ctx, deviceID)

	// Behavioral features
	features["click_frequency"] = fe.getClickFrequency(ctx, deviceID)
	features["session_duration"] = fe.getAvgSessionDuration(ctx, deviceID)
	features["time_between_clicks"] = fe.getAvgTimeBetweenClicks(ctx, deviceID)

	// Temporal features
	now := time.Now()
	features["hour_of_day"] = float64(now.Hour()) / 24.0
	features["day_of_week"] = float64(now.Weekday()) / 7.0
	if now.Weekday() == time.Saturday || now.Weekday() == time.Sunday {
		features["is_weekend"] = 1.0
	} else {
		features["is_weekend"] = 0.0
	}

	// Network features
	if fe.isDatacenterIP(ip) {
		features["is_datacenter"] = 1.0
	} else {
		features["is_datacenter"] = 0.0
	}

	// User agent features
	features["ua_length"] = float64(len(userAgent)) / 500.0 // Normalize
	features["ua_entropy"] = fe.calculateEntropy(userAgent)

	if fe.isMobileUA(userAgent) {
		features["is_mobile_ua"] = 1.0
	} else {
		features["is_mobile_ua"] = 0.0
	}

	// Historical features
	features["historical_fraud_rate"] = fe.getHistoricalFraudRate(ctx, deviceID)
	features["conversion_rate"] = fe.getConversionRate(ctx, deviceID)

	return features
}

// Helper methods for feature extraction
func (fe *FeatureEngineering) getDeviceAge(ctx context.Context, deviceID string) float64 {
	key := fmt.Sprintf("device_first_seen:%s", deviceID)
	firstSeen, err := fe.redis.Get(ctx, key).Int64()
	if err != nil {
		// First time seeing this device
		fe.redis.Set(ctx, key, time.Now().Unix(), 0)
		return 0.0
	}

	ageSeconds := time.Now().Unix() - firstSeen
	ageDays := float64(ageSeconds) / 86400.0
	return math.Min(ageDays/365.0, 1.0) // Normalize to 0-1 (cap at 1 year)
}

func (fe *FeatureEngineering) getDeviceIPCount(ctx context.Context, deviceID string) float64 {
	key := fmt.Sprintf("device_ips:%s", deviceID)
	count, _ := fe.redis.SCard(ctx, key).Result()
	return math.Min(float64(count)/10.0, 1.0) // Normalize, cap at 10
}

func (fe *FeatureEngineering) getDeviceAppCount(ctx context.Context, deviceID string) float64 {
	key := fmt.Sprintf("device_apps:%s", deviceID)
	count, _ := fe.redis.SCard(ctx, key).Result()
	return math.Min(float64(count)/20.0, 1.0) // Normalize, cap at 20
}

func (fe *FeatureEngineering) getClickFrequency(ctx context.Context, deviceID string) float64 {
	key := fmt.Sprintf("click_count:%s", deviceID)
	count, _ := fe.redis.Get(ctx, key).Int64()
	return math.Min(float64(count)/50.0, 1.0) // Normalize, cap at 50/day
}

func (fe *FeatureEngineering) getAvgSessionDuration(ctx context.Context, deviceID string) float64 {
	// Simplified - would calculate from session events
	return 0.5 // Placeholder
}

func (fe *FeatureEngineering) getAvgTimeBetweenClicks(ctx context.Context, deviceID string) float64 {
	// Simplified - would calculate from click timestamps
	return 0.5 // Placeholder
}

func (fe *FeatureEngineering) isDatacenterIP(ip string) bool {
	// Simplified - would check against IP ranges
	return false
}

func (fe *FeatureEngineering) calculateEntropy(s string) float64 {
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

	return math.Min(entropy/5.0, 1.0) // Normalize
}

func (fe *FeatureEngineering) isMobileUA(userAgent string) bool {
	// Simplified - would use regex
	return true
}

func (fe *FeatureEngineering) getHistoricalFraudRate(ctx context.Context, deviceID string) float64 {
	key := fmt.Sprintf("device_fraud_rate:%s", deviceID)
	rate, _ := fe.redis.Get(ctx, key).Float64()
	return rate
}

func (fe *FeatureEngineering) getConversionRate(ctx context.Context, deviceID string) float64 {
	key := fmt.Sprintf("device_conversion_rate:%s", deviceID)
	rate, _ := fe.redis.Get(ctx, key).Float64()
	return rate
}
