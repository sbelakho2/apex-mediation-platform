package rollout

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	log "github.com/sirupsen/logrus"
)

// Controller manages staged rollouts with automatic rollback
type Controller struct {
	redis *redis.Client
}

// RolloutConfig defines a staged rollout
type RolloutConfig struct {
	ConfigID   string        `json:"config_id"`
	Stages     []Stage       `json:"stages"`
	SLOTargets SLOTargets    `json:"slo_targets"`
	Status     RolloutStatus `json:"status"`
	StartedAt  time.Time     `json:"started_at"`
	UpdatedAt  time.Time     `json:"updated_at"`
}

// Stage represents a rollout stage
type Stage struct {
	Name        string  `json:"name"`
	Percentage  float64 `json:"percentage"`
	DurationMin int     `json:"duration_min"`
	Status      string  `json:"status"` // pending, active, completed, failed
}

// SLOTargets defines service level objectives
type SLOTargets struct {
	CrashFreeRate float64 `json:"crash_free_rate"` // e.g., 0.998 = 99.8%
	ANRRate       float64 `json:"anr_rate"`        // e.g., 0.0005 = 0.05%
	P99LatencyMs  int     `json:"p99_latency_ms"`  // e.g., 150ms
}

// RolloutStatus tracks current rollout state
type RolloutStatus struct {
	CurrentStage int       `json:"current_stage"`
	State        string    `json:"state"` // deploying, monitoring, completed, rolled_back
	Message      string    `json:"message"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Metrics from telemetry system
type Metrics struct {
	CrashFreeRate float64
	ANRRate       float64
	P99LatencyMs  int
}

// NewController creates a new rollout controller
func NewController(redis *redis.Client) *Controller {
	return &Controller{
		redis: redis,
	}
}

// Deploy starts a staged rollout
func (c *Controller) Deploy(ctx context.Context, config *RolloutConfig) error {
	// Default stages if not provided
	if len(config.Stages) == 0 {
		config.Stages = []Stage{
			{Name: "canary", Percentage: 0.01, DurationMin: 30, Status: "pending"},
			{Name: "early", Percentage: 0.05, DurationMin: 60, Status: "pending"},
			{Name: "expanded", Percentage: 0.25, DurationMin: 120, Status: "pending"},
			{Name: "full", Percentage: 1.00, DurationMin: 0, Status: "pending"},
		}
	}

	// Default SLO targets
	if config.SLOTargets.CrashFreeRate == 0 {
		config.SLOTargets = SLOTargets{
			CrashFreeRate: 0.998,  // 99.8%
			ANRRate:       0.0005, // 0.05%
			P99LatencyMs:  150,    // 150ms
		}
	}

	config.Status = RolloutStatus{
		CurrentStage: 0,
		State:        "deploying",
		Message:      "Starting staged rollout",
		UpdatedAt:    time.Now().UTC(),
	}
	config.StartedAt = time.Now().UTC()
	config.UpdatedAt = time.Now().UTC()

	// Save rollout config
	if err := c.saveRollout(ctx, config); err != nil {
		return err
	}

	log.Infof("Started rollout for config %s", config.ConfigID)

	// Start rollout process in background
	go c.executeRollout(context.Background(), config)

	return nil
}

// executeRollout performs the staged rollout
func (c *Controller) executeRollout(ctx context.Context, config *RolloutConfig) {
	for i, stage := range config.Stages {
		log.Infof("Deploying stage %d: %s (%.1f%%)", i, stage.Name, stage.Percentage*100)

		// Update stage status
		config.Stages[i].Status = "active"
		config.Status.CurrentStage = i
		config.Status.Message = fmt.Sprintf("Deploying to %.1f%% of users", stage.Percentage*100)
		c.saveRollout(ctx, config)

		// Deploy to percentage of users (update routing in Redis)
		if err := c.updateRouting(ctx, config.ConfigID, stage.Percentage); err != nil {
			log.Errorf("Failed to update routing: %v", err)
			c.rollback(ctx, config, fmt.Sprintf("Routing update failed: %v", err))
			return
		}

		// Monitor for duration (if not final stage)
		if stage.DurationMin > 0 {
			ticker := time.NewTicker(1 * time.Minute)
			defer ticker.Stop()

			endTime := time.Now().Add(time.Duration(stage.DurationMin) * time.Minute)

			for time.Now().Before(endTime) {
				<-ticker.C

				// Check SLOs
				metrics, err := c.getCurrentMetrics(ctx, config.ConfigID)
				if err != nil {
					log.Errorf("Failed to get metrics: %v", err)
					continue
				}

				// Validate against targets
				if violation := c.checkSLOViolation(metrics, config.SLOTargets); violation != "" {
					log.Warnf("SLO violation detected: %s", violation)
					c.rollback(ctx, config, violation)
					return
				}

				log.Debugf("SLO check passed for stage %s", stage.Name)
			}
		}

		// Mark stage as completed
		config.Stages[i].Status = "completed"
		c.saveRollout(ctx, config)

		log.Infof("Stage %s completed successfully", stage.Name)
	}

	// Rollout completed
	config.Status.State = "completed"
	config.Status.Message = "Rollout completed successfully"
	config.UpdatedAt = time.Now().UTC()
	c.saveRollout(ctx, config)

	log.Infof("Rollout completed for config %s", config.ConfigID)
}

// rollback reverts the configuration
func (c *Controller) rollback(ctx context.Context, config *RolloutConfig, reason string) {
	log.Warnf("Rolling back config %s: %s", config.ConfigID, reason)

	// Mark rollout as rolled back
	config.Status.State = "rolled_back"
	config.Status.Message = reason
	config.UpdatedAt = time.Now().UTC()

	// Revert to previous config
	if err := c.updateRouting(ctx, "previous", 1.0); err != nil {
		log.Errorf("Failed to rollback routing: %v", err)
	}

	// Save final state
	c.saveRollout(ctx, config)

	// Alert team
	c.alertTeam(config, reason)
}

// checkSLOViolation checks if metrics violate SLO targets
func (c *Controller) checkSLOViolation(metrics *Metrics, targets SLOTargets) string {
	if metrics.CrashFreeRate < targets.CrashFreeRate {
		return fmt.Sprintf("Crash rate too high: %.4f < %.4f",
			metrics.CrashFreeRate, targets.CrashFreeRate)
	}

	if metrics.ANRRate > targets.ANRRate {
		return fmt.Sprintf("ANR rate too high: %.4f > %.4f",
			metrics.ANRRate, targets.ANRRate)
	}

	if metrics.P99LatencyMs > targets.P99LatencyMs {
		return fmt.Sprintf("P99 latency too high: %dms > %dms",
			metrics.P99LatencyMs, targets.P99LatencyMs)
	}

	return ""
}

// Helper functions

func (c *Controller) saveRollout(ctx context.Context, config *RolloutConfig) error {
	data, err := json.Marshal(config)
	if err != nil {
		return err
	}

	key := fmt.Sprintf("rollout:%s", config.ConfigID)
	return c.redis.Set(ctx, key, data, 24*time.Hour).Err()
}

func (c *Controller) updateRouting(ctx context.Context, configID string, percentage float64) error {
	// Update routing table in Redis
	key := "config:routing"
	data := map[string]interface{}{
		"config_id":  configID,
		"percentage": percentage,
		"updated_at": time.Now().UTC().Unix(),
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	return c.redis.Set(ctx, key, jsonData, 0).Err()
}

func (c *Controller) getCurrentMetrics(ctx context.Context, configID string) (*Metrics, error) {
	// TODO: Query metrics from telemetry system
	// For now, return mock metrics
	return &Metrics{
		CrashFreeRate: 0.999,
		ANRRate:       0.0002,
		P99LatencyMs:  120,
	}, nil
}

func (c *Controller) alertTeam(config *RolloutConfig, reason string) {
	// TODO: Implement alerting (PagerDuty, Slack, etc.)
	log.Errorf("ALERT: Rollback triggered for %s: %s", config.ConfigID, reason)
}

// GetStatus returns current rollout status
func (c *Controller) GetStatus(ctx context.Context, configID string) (*RolloutConfig, error) {
	key := fmt.Sprintf("rollout:%s", configID)
	data, err := c.redis.Get(ctx, key).Bytes()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, errors.New("rollout not found")
		}
		return nil, err
	}

	var config RolloutConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	return &config, nil
}
