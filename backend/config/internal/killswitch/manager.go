package killswitch

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	log "github.com/sirupsen/logrus"
)

// Manager handles kill switch operations
type Manager struct {
	redis *redis.Client
}

// KillSwitch represents an active kill switch
type KillSwitch struct {
	Type        string    `json:"type"` // global, adapter, placement
	ID          string    `json:"id"`   // identifier
	ActivatedAt time.Time `json:"activated_at"`
	ActivatedBy string    `json:"activated_by"`
	Reason      string    `json:"reason"`
}

// NewManager creates a new kill switch manager
func NewManager(redis *redis.Client) *Manager {
	return &Manager{
		redis: redis,
	}
}

// Activate activates a kill switch
func (m *Manager) Activate(ctx context.Context, switchType, switchID string) error {
	if !isValidType(switchType) {
		return fmt.Errorf("invalid switch type: %s", switchType)
	}

	killSwitch := &KillSwitch{
		Type:        switchType,
		ID:          switchID,
		ActivatedAt: time.Now().UTC(),
		ActivatedBy: "api", // TODO: Get from context
		Reason:      "Manual activation",
	}

	key := m.getKey(switchType, switchID)
	data, err := json.Marshal(killSwitch)
	if err != nil {
		return err
	}

	// Store with no expiration (manual deactivation required)
	if err := m.redis.Set(ctx, key, data, 0).Err(); err != nil {
		return err
	}

	// Add to active set for listing
	if err := m.redis.SAdd(ctx, "killswitch:active", key).Err(); err != nil {
		return err
	}

	log.Warnf("Kill switch activated: %s/%s", switchType, switchID)

	return nil
}

// Deactivate deactivates a kill switch
func (m *Manager) Deactivate(ctx context.Context, switchType, switchID string) error {
	if !isValidType(switchType) {
		return fmt.Errorf("invalid switch type: %s", switchType)
	}

	key := m.getKey(switchType, switchID)

	// Remove from Redis
	if err := m.redis.Del(ctx, key).Err(); err != nil {
		return err
	}

	// Remove from active set
	if err := m.redis.SRem(ctx, "killswitch:active", key).Err(); err != nil {
		return err
	}

	log.Infof("Kill switch deactivated: %s/%s", switchType, switchID)

	return nil
}

// IsActive checks if a kill switch is active
func (m *Manager) IsActive(ctx context.Context, switchType, switchID string) bool {
	// Check global kill switch first
	if switchType != "global" {
		if m.isActiveInternal(ctx, "global", "all") {
			return true
		}
	}

	return m.isActiveInternal(ctx, switchType, switchID)
}

// isActiveInternal checks if a specific kill switch is active
func (m *Manager) isActiveInternal(ctx context.Context, switchType, switchID string) bool {
	key := m.getKey(switchType, switchID)
	exists, err := m.redis.Exists(ctx, key).Result()
	if err != nil {
		log.Errorf("Failed to check kill switch: %v", err)
		return false
	}

	return exists > 0
}

// ListActive returns all active kill switches
func (m *Manager) ListActive(ctx context.Context) ([]*KillSwitch, error) {
	// Get all active keys
	keys, err := m.redis.SMembers(ctx, "killswitch:active").Result()
	if err != nil {
		return nil, err
	}

	switches := make([]*KillSwitch, 0, len(keys))

	for _, key := range keys {
		data, err := m.redis.Get(ctx, key).Bytes()
		if err != nil {
			log.Warnf("Failed to get kill switch %s: %v", key, err)
			continue
		}

		var ks KillSwitch
		if err := json.Unmarshal(data, &ks); err != nil {
			log.Warnf("Failed to unmarshal kill switch %s: %v", key, err)
			continue
		}

		switches = append(switches, &ks)
	}

	return switches, nil
}

// Get retrieves a specific kill switch
func (m *Manager) Get(ctx context.Context, switchType, switchID string) (*KillSwitch, error) {
	key := m.getKey(switchType, switchID)
	data, err := m.redis.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var ks KillSwitch
	if err := json.Unmarshal(data, &ks); err != nil {
		return nil, err
	}

	return &ks, nil
}

// ActivateWithReason activates a kill switch with a specific reason
func (m *Manager) ActivateWithReason(ctx context.Context, switchType, switchID, reason, activatedBy string) error {
	if !isValidType(switchType) {
		return fmt.Errorf("invalid switch type: %s", switchType)
	}

	killSwitch := &KillSwitch{
		Type:        switchType,
		ID:          switchID,
		ActivatedAt: time.Now().UTC(),
		ActivatedBy: activatedBy,
		Reason:      reason,
	}

	key := m.getKey(switchType, switchID)
	data, err := json.Marshal(killSwitch)
	if err != nil {
		return err
	}

	if err := m.redis.Set(ctx, key, data, 0).Err(); err != nil {
		return err
	}

	if err := m.redis.SAdd(ctx, "killswitch:active", key).Err(); err != nil {
		return err
	}

	log.Warnf("Kill switch activated: %s/%s - Reason: %s", switchType, switchID, reason)

	return nil
}

// Helper functions

func (m *Manager) getKey(switchType, switchID string) string {
	return fmt.Sprintf("killswitch:%s:%s", switchType, switchID)
}

func isValidType(switchType string) bool {
	validTypes := map[string]bool{
		"global":    true,
		"adapter":   true,
		"placement": true,
	}

	return validTypes[switchType]
}
