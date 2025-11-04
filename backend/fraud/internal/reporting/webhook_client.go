package reporting

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// HTTPWebhookClient implements webhook delivery via HTTP
type HTTPWebhookClient struct {
	httpClient *http.Client
}

// NewHTTPWebhookClient creates a new HTTP webhook client
func NewHTTPWebhookClient(timeout time.Duration) *HTTPWebhookClient {
	return &HTTPWebhookClient{
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

// Send sends a fraud alert to a webhook URL
func (c *HTTPWebhookClient) Send(ctx context.Context, webhook WebhookConfig, alert FraudAlert) error {
	// Create webhook payload with metadata
	webhookPayload := map[string]interface{}{
		"event":      "fraud.alert",
		"timestamp":  time.Now().Unix(),
		"alert":      alert,
		"webhook_id": webhook.ID,
	}

	payloadBytes, err := json.Marshal(webhookPayload)
	if err != nil {
		return fmt.Errorf("failed to marshal webhook payload: %w", err)
	}

	// Retry logic
	var lastErr error
	backoff := webhook.RetryPolicy.RetryInterval

	for attempt := 0; attempt <= webhook.RetryPolicy.MaxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(backoff)
			backoff = time.Duration(float64(backoff) * webhook.RetryPolicy.BackoffFactor)
		}

		// Create request
		req, err := http.NewRequestWithContext(ctx, "POST", webhook.URL, bytes.NewReader(payloadBytes))
		if err != nil {
			lastErr = fmt.Errorf("failed to create request: %w", err)
			continue
		}

		// Set headers
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "FraudDetection-Webhook/1.0")
		req.Header.Set("X-Webhook-ID", webhook.ID)
		req.Header.Set("X-Event-Type", "fraud.alert")

		// Add custom headers
		for key, value := range webhook.Headers {
			req.Header.Set(key, value)
		}

		// Calculate HMAC signature
		if webhook.Secret != "" {
			signature := c.calculateSignature(payloadBytes, webhook.Secret)
			req.Header.Set("X-Signature", signature)
		}

		// Send request
		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("failed to send webhook: %w", err)
			continue
		}

		// Read response
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		// Check status code
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil // Success
		}

		lastErr = fmt.Errorf("webhook returned status %d: %s", resp.StatusCode, string(body))

		// Don't retry on client errors (4xx)
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			break
		}
	}

	return fmt.Errorf("webhook failed after %d attempts: %w", webhook.RetryPolicy.MaxRetries+1, lastErr)
}

// calculateSignature computes HMAC-SHA256 signature
func (c *HTTPWebhookClient) calculateSignature(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifySignature verifies webhook signature
func VerifySignature(payload []byte, signature string, secret string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expectedSignature := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(signature), []byte(expectedSignature))
}
