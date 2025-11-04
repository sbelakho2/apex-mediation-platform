package paypalpay

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/shopspring/decimal"
	log "github.com/sirupsen/logrus"
)

const (
	PayPalSandboxAPI    = "https://api-m.sandbox.paypal.com"
	PayPalProductionAPI = "https://api-m.paypal.com"
)

// PayPalRail implements PayPal Payouts
type PayPalRail struct {
	clientID     string
	clientSecret string
	baseURL      string
	accessToken  string
	tokenExpiry  time.Time
	client       *http.Client
}

// NewPayPalRail creates a new PayPal payment rail
func NewPayPalRail(clientID, clientSecret string, production bool) *PayPalRail {
	baseURL := PayPalSandboxAPI
	if production {
		baseURL = PayPalProductionAPI
	}

	return &PayPalRail{
		clientID:     clientID,
		clientSecret: clientSecret,
		baseURL:      baseURL,
		client:       &http.Client{Timeout: 30 * time.Second},
	}
}

// ProcessPayout sends payment via PayPal Payouts
func (pr *PayPalRail) ProcessPayout(ctx context.Context, email string, amount decimal.Decimal, currency, senderItemID string) (string, error) {
	// Get access token
	if err := pr.ensureAccessToken(ctx); err != nil {
		return "", err
	}

	// Create payout batch
	batchID := fmt.Sprintf("batch_%d", time.Now().UnixNano())

	payout := map[string]interface{}{
		"sender_batch_header": map[string]string{
			"sender_batch_id": batchID,
			"email_subject":   "You have a payment",
			"email_message":   "You have received a payment from Rival ApexMediation",
		},
		"items": []map[string]interface{}{
			{
				"recipient_type": "EMAIL",
				"amount": map[string]string{
					"value":    amount.String(),
					"currency": currency,
				},
				"receiver":       email,
				"note":           "Payment for ad revenue",
				"sender_item_id": senderItemID,
			},
		},
	}

	body, _ := json.Marshal(payout)

	req, err := http.NewRequestWithContext(ctx, "POST", pr.baseURL+"/v1/payments/payouts", bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+pr.accessToken)

	resp, err := pr.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("PayPal payout failed: %s", string(respBody))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", err
	}

	payoutBatchID := result["batch_header"].(map[string]interface{})["payout_batch_id"].(string)

	log.WithFields(log.Fields{
		"email":           email,
		"amount":          amount,
		"currency":        currency,
		"payout_batch_id": payoutBatchID,
	}).Info("Processed PayPal payout")

	return payoutBatchID, nil
}

// GetPayoutStatus gets status of PayPal payout
func (pr *PayPalRail) GetPayoutStatus(ctx context.Context, payoutBatchID string) (string, error) {
	if err := pr.ensureAccessToken(ctx); err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, "GET", pr.baseURL+"/v1/payments/payouts/"+payoutBatchID, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "Bearer "+pr.accessToken)

	resp, err := pr.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}

	batchStatus := result["batch_header"].(map[string]interface{})["batch_status"].(string)
	return batchStatus, nil
}

// ensureAccessToken gets or refreshes access token
func (pr *PayPalRail) ensureAccessToken(ctx context.Context) error {
	// Check if token is still valid
	if time.Now().Before(pr.tokenExpiry) && pr.accessToken != "" {
		return nil
	}

	// Get new token
	req, err := http.NewRequestWithContext(ctx, "POST", pr.baseURL+"/v1/oauth2/token",
		bytes.NewReader([]byte("grant_type=client_credentials")))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(pr.clientID, pr.clientSecret)

	resp, err := pr.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return err
	}

	pr.accessToken = result["access_token"].(string)
	expiresIn := int(result["expires_in"].(float64))
	pr.tokenExpiry = time.Now().Add(time.Duration(expiresIn) * time.Second)

	log.Info("Obtained PayPal access token")

	return nil
}
