package stripepay

import (
	"context"
	"fmt"

	"github.com/shopspring/decimal"
	log "github.com/sirupsen/logrus"
	"github.com/stripe/stripe-go/v76"
	"github.com/stripe/stripe-go/v76/account"
	"github.com/stripe/stripe-go/v76/transfer"
)

// StripeRail implements Stripe Connect payouts
type StripeRail struct {
	apiKey string
}

// NewStripeRail creates a new Stripe payment rail
func NewStripeRail(apiKey string) *StripeRail {
	stripe.Key = apiKey
	return &StripeRail{
		apiKey: apiKey,
	}
}

// CreateConnectAccount creates a Stripe Connect account for publisher
func (sr *StripeRail) CreateConnectAccount(ctx context.Context, publisherID, email, country string) (string, error) {
	params := &stripe.AccountParams{
		Type:    stripe.String(string(stripe.AccountTypeExpress)),
		Country: stripe.String(country),
		Email:   stripe.String(email),
		Capabilities: &stripe.AccountCapabilitiesParams{
			Transfers: &stripe.AccountCapabilitiesTransfersParams{
				Requested: stripe.Bool(true),
			},
		},
		Metadata: map[string]string{
			"publisher_id": publisherID,
		},
	}

	acc, err := account.New(params)
	if err != nil {
		return "", fmt.Errorf("failed to create Stripe account: %w", err)
	}

	log.WithFields(log.Fields{
		"publisher_id": publisherID,
		"account_id":   acc.ID,
	}).Info("Created Stripe Connect account")

	return acc.ID, nil
}

// ProcessPayout sends payment to publisher's Stripe Connect account
func (sr *StripeRail) ProcessPayout(ctx context.Context, accountID string, amount decimal.Decimal, currency, description string) (string, error) {
	// Convert decimal to cents (Stripe uses smallest currency unit)
	amountCents := amount.Mul(decimal.NewFromInt(100)).IntPart()

	params := &stripe.TransferParams{
		Amount:      stripe.Int64(amountCents),
		Currency:    stripe.String(currency),
		Destination: stripe.String(accountID),
		Description: stripe.String(description),
	}

	t, err := transfer.New(params)
	if err != nil {
		return "", fmt.Errorf("failed to create transfer: %w", err)
	}

	log.WithFields(log.Fields{
		"account_id":  accountID,
		"amount":      amount,
		"currency":    currency,
		"transfer_id": t.ID,
	}).Info("Processed Stripe payout")

	return t.ID, nil
}

// GetPayoutStatus gets status of a Stripe transfer
func (sr *StripeRail) GetPayoutStatus(ctx context.Context, transferID string) (string, error) {
	t, err := transfer.Get(transferID, nil)
	if err != nil {
		return "", err
	}

	// Stripe transfers are typically completed immediately
	// Return based on whether the object was retrieved successfully
	if t.ID != "" {
		return "completed", nil
	}

	return "pending", nil
} // GetAccountStatus gets status of Stripe Connect account
func (sr *StripeRail) GetAccountStatus(ctx context.Context, accountID string) (string, error) {
	acc, err := account.GetByID(accountID, nil)
	if err != nil {
		return "", err
	}

	// Check if account can receive payouts
	if acc.PayoutsEnabled {
		return "active", nil
	} else if acc.DetailsSubmitted {
		return "pending", nil
	}

	return "incomplete", nil
}
