package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/shopspring/decimal"
	log "github.com/sirupsen/logrus"
)

// PaymentRail defines interface for payment processors
type PaymentRail interface {
	ProcessPayout(ctx context.Context, recipientID string, amount decimal.Decimal, currency, referenceID string) (string, error)
	GetPayoutStatus(ctx context.Context, payoutID string) (string, error)
}

// PaymentMethod represents a payment method
type PaymentMethod string

const (
	MethodStripe PaymentMethod = "stripe"
	MethodPayPal PaymentMethod = "paypal"
	MethodWire   PaymentMethod = "wire"
	MethodACH    PaymentMethod = "ach"
	MethodCrypto PaymentMethod = "crypto"
)

// PaymentManager orchestrates multi-rail payments
type PaymentManager struct {
	rails map[PaymentMethod]PaymentRail
	redis *redis.Client
}

// NewPaymentManager creates a new payment manager
func NewPaymentManager(redisClient *redis.Client) *PaymentManager {
	return &PaymentManager{
		rails: make(map[PaymentMethod]PaymentRail),
		redis: redisClient,
	}
}

// RegisterRail registers a payment rail
func (pm *PaymentManager) RegisterRail(method PaymentMethod, rail PaymentRail) {
	pm.rails[method] = rail
	log.WithField("method", method).Info("Registered payment rail")
}

// InitiatePayout initiates a payout through the appropriate rail
func (pm *PaymentManager) InitiatePayout(ctx context.Context, publisherID string, amount decimal.Decimal, currency string) (string, error) {
	// Get publisher's preferred payment method
	method, err := pm.getPaymentMethod(ctx, publisherID)
	if err != nil {
		return "", err
	}

	// Get payment rail
	rail, ok := pm.rails[method]
	if !ok {
		return "", fmt.Errorf("payment rail not available: %s", method)
	}

	// Get recipient ID for the payment method
	recipientID, err := pm.getRecipientID(ctx, publisherID, method)
	if err != nil {
		return "", err
	}

	// Create payout record
	payoutID := fmt.Sprintf("payout_%s_%d", publisherID, time.Now().UnixNano())

	payout := PayoutRecord{
		ID:          payoutID,
		PublisherID: publisherID,
		Amount:      amount,
		Currency:    currency,
		Method:      method,
		Status:      StatusPending,
		CreatedAt:   time.Now(),
	}

	if err := pm.storePayoutRecord(ctx, payout); err != nil {
		return "", err
	}

	// Process payout through rail
	externalID, err := rail.ProcessPayout(ctx, recipientID, amount, currency, payoutID)
	if err != nil {
		pm.updatePayoutStatus(ctx, payoutID, StatusFailed, err.Error())
		return "", err
	}

	// Update record with external ID
	payout.ExternalID = externalID
	payout.Status = StatusProcessing
	if err := pm.storePayoutRecord(ctx, payout); err != nil {
		return "", err
	}

	log.WithFields(log.Fields{
		"payout_id":    payoutID,
		"publisher_id": publisherID,
		"amount":       amount,
		"method":       method,
		"external_id":  externalID,
	}).Info("Initiated payout")

	return payoutID, nil
}

// GetPayoutStatus gets current status of a payout
func (pm *PaymentManager) GetPayoutStatus(ctx context.Context, payoutID string) (PayoutStatus, error) {
	payout, err := pm.getPayoutRecord(ctx, payoutID)
	if err != nil {
		return "", err
	}

	// If already in terminal state, return cached status
	if payout.Status == StatusCompleted || payout.Status == StatusFailed {
		return payout.Status, nil
	}

	// Query external rail for status
	rail, ok := pm.rails[payout.Method]
	if !ok {
		return "", fmt.Errorf("payment rail not available: %s", payout.Method)
	}

	externalStatus, err := rail.GetPayoutStatus(ctx, payout.ExternalID)
	if err != nil {
		return payout.Status, nil // Return cached status on error
	}

	// Map external status to internal status
	status := pm.mapExternalStatus(externalStatus, payout.Method)

	if status != payout.Status {
		pm.updatePayoutStatus(ctx, payoutID, status, "")
	}

	return status, nil
}

// PayoutStatus represents the status of a payout
type PayoutStatus string

const (
	StatusPending    PayoutStatus = "pending"
	StatusProcessing PayoutStatus = "processing"
	StatusCompleted  PayoutStatus = "completed"
	StatusFailed     PayoutStatus = "failed"
)

// PayoutRecord represents a payout transaction
type PayoutRecord struct {
	ID           string          `json:"id"`
	PublisherID  string          `json:"publisher_id"`
	Amount       decimal.Decimal `json:"amount"`
	Currency     string          `json:"currency"`
	Method       PaymentMethod   `json:"method"`
	Status       PayoutStatus    `json:"status"`
	ExternalID   string          `json:"external_id"`
	ErrorMessage string          `json:"error_message,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
	CompletedAt  *time.Time      `json:"completed_at,omitempty"`
}

// Internal methods

func (pm *PaymentManager) getPaymentMethod(ctx context.Context, publisherID string) (PaymentMethod, error) {
	key := fmt.Sprintf("payment_method:%s", publisherID)
	method, err := pm.redis.Get(ctx, key).Result()
	if err == redis.Nil {
		return MethodStripe, nil // Default to Stripe
	} else if err != nil {
		return "", err
	}
	return PaymentMethod(method), nil
}

func (pm *PaymentManager) getRecipientID(ctx context.Context, publisherID string, method PaymentMethod) (string, error) {
	key := fmt.Sprintf("recipient:%s:%s", publisherID, method)
	recipientID, err := pm.redis.Get(ctx, key).Result()
	if err != nil {
		return "", fmt.Errorf("recipient ID not found for %s: %w", method, err)
	}
	return recipientID, nil
}

func (pm *PaymentManager) storePayoutRecord(ctx context.Context, payout PayoutRecord) error {
	key := fmt.Sprintf("payout:%s", payout.ID)
	data, err := json.Marshal(payout)
	if err != nil {
		return err
	}
	return pm.redis.Set(ctx, key, data, 0).Err()
}

func (pm *PaymentManager) getPayoutRecord(ctx context.Context, payoutID string) (PayoutRecord, error) {
	key := fmt.Sprintf("payout:%s", payoutID)
	data, err := pm.redis.Get(ctx, key).Bytes()
	if err != nil {
		return PayoutRecord{}, err
	}

	var payout PayoutRecord
	if err := json.Unmarshal(data, &payout); err != nil {
		return PayoutRecord{}, err
	}
	return payout, nil
}

func (pm *PaymentManager) updatePayoutStatus(ctx context.Context, payoutID string, status PayoutStatus, errorMsg string) {
	payout, err := pm.getPayoutRecord(ctx, payoutID)
	if err != nil {
		log.WithError(err).Warn("Failed to get payout record for status update")
		return
	}

	payout.Status = status
	payout.ErrorMessage = errorMsg

	if status == StatusCompleted {
		now := time.Now()
		payout.CompletedAt = &now
	}

	pm.storePayoutRecord(ctx, payout)
}

func (pm *PaymentManager) mapExternalStatus(externalStatus string, method PaymentMethod) PayoutStatus {
	// Map external statuses to internal statuses
	switch method {
	case MethodStripe:
		switch externalStatus {
		case "pending", "in_transit":
			return StatusProcessing
		case "paid":
			return StatusCompleted
		case "failed", "canceled":
			return StatusFailed
		}
	case MethodPayPal:
		switch externalStatus {
		case "PENDING", "PROCESSING":
			return StatusProcessing
		case "SUCCESS":
			return StatusCompleted
		case "FAILED", "DENIED":
			return StatusFailed
		}
	}
	return StatusPending
}

// SchedulePayouts schedules payouts for publishers meeting payment terms
func (pm *PaymentManager) SchedulePayouts(ctx context.Context) error {
	log.Info("Starting payout scheduling")

	// This would query database for publishers with:
	// 1. Balance >= minimum payout threshold
	// 2. Payment cycle date reached (e.g., net-60)
	// 3. No pending payouts

	// For now, this is a stub that would integrate with the ledger

	return nil
}
