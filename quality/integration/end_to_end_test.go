package integration_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestEndToEndAuctionFlow tests the complete ad auction flow
func TestEndToEndAuctionFlow(t *testing.T) {
	// Setup test environment
	publisherID := createTestPublisher(t)
	placementID := createTestPlacement(t, publisherID)
	configureTestAdapters(t, placementID)

	// Step 1: SDK requests ad
	t.Run("SDK Ad Request", func(t *testing.T) {
		reqBody := map[string]interface{}{
			"placement_id": placementID,
			"device": map[string]interface{}{
				"type":       "phone",
				"os":         "android",
				"os_version": "13",
				"id":         uuid.New().String(),
			},
			"app": map[string]interface{}{
				"version": "1.2.3",
				"bundle":  "com.example.testapp",
			},
			"session_id": uuid.New().String(),
		}

		resp := makeAPIRequest(t, "POST", "/v1/ad/request", publisherID, reqBody)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var adResponse map[string]interface{}
		err := json.NewDecoder(resp.Body).Decode(&adResponse)
		require.NoError(t, err)

		// Verify response structure
		assert.NotEmpty(t, adResponse["auction_id"])
		assert.NotEmpty(t, adResponse["ad_unit"])
		assert.NotEmpty(t, adResponse["network"])
		assert.Greater(t, adResponse["bid_price"], 0.0)

		auctionID := adResponse["auction_id"].(string)

		// Step 2: Track impression
		t.Run("Track Impression", func(t *testing.T) {
			impressionData := map[string]interface{}{
				"auction_id":   auctionID,
				"placement_id": placementID,
				"load_time_ms": 250,
				"timestamp":    time.Now().Unix(),
			}

			impResp := makeAPIRequest(t, "POST", "/v1/events/impression", publisherID, impressionData)
			assert.Equal(t, http.StatusOK, impResp.StatusCode)

			// Verify impression recorded in Postgres analytics
			waitForAsyncFlush()
			impressionCount := queryAnalyticsPostgres(t, fmt.Sprintf(
				"SELECT count() FROM impressions WHERE auction_id = '%s'",
				auctionID,
			))
			assert.Equal(t, 1, impressionCount)
		})

		// Step 3: Track click (optional)
		t.Run("Track Click", func(t *testing.T) {
			clickData := map[string]interface{}{
				"auction_id":   auctionID,
				"placement_id": placementID,
				"timestamp":    time.Now().Unix(),
			}

			clickResp := makeAPIRequest(t, "POST", "/v1/events/click", publisherID, clickData)
			assert.Equal(t, http.StatusOK, clickResp.StatusCode)

			// Verify click recorded in Postgres analytics
			waitForAsyncFlush()
			clickCount := queryAnalyticsPostgres(t, fmt.Sprintf(
				"SELECT count() FROM clicks WHERE impression_id IN (SELECT event_id FROM impressions WHERE auction_id = '%s')",
				auctionID,
			))
			assert.Equal(t, 1, clickCount)
		})

		// Step 4: Verify revenue attribution
		t.Run("Revenue Attribution", func(t *testing.T) {
			// Query analytics API
			analyticsResp := makeAPIRequest(t, "GET", fmt.Sprintf(
				"/v1/analytics/revenue?start_date=%s&end_date=%s&placement_id=%s",
				time.Now().Format("2006-01-02"),
				time.Now().Format("2006-01-02"),
				placementID,
			), publisherID, nil)

			assert.Equal(t, http.StatusOK, analyticsResp.StatusCode)

			var analytics map[string]interface{}
			err := json.NewDecoder(analyticsResp.Body).Decode(&analytics)
			require.NoError(t, err)

			assert.Greater(t, analytics["total_revenue"], 0.0)
			assert.Greater(t, analytics["impressions"], 0.0)
		})
	})
}

// TestFraudDetectionPipeline tests fraud detection end-to-end
func TestFraudDetectionPipeline(t *testing.T) {
	publisherID := createTestPublisher(t)
	placementID := createTestPlacement(t, publisherID)

	// Configure fraud rules
	t.Run("Configure Fraud Rules", func(t *testing.T) {
		ruleConfig := map[string]interface{}{
			"rule_type": "givt",
			"severity":  "high",
			"enabled":   true,
			"threshold": map[string]interface{}{
				"max_requests_per_device": 100,
				"time_window_seconds":     3600,
			},
			"action": "block",
		}

		resp := makeAPIRequest(t, "POST", "/v1/fraud/rules", publisherID, ruleConfig)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})

	// Simulate fraudulent traffic
	t.Run("Detect GIVT", func(t *testing.T) {
		deviceID := uuid.New().String()

		// Send 150 requests from same device in short period (trigger threshold)
		for i := 0; i < 150; i++ {
			reqBody := map[string]interface{}{
				"placement_id": placementID,
				"device": map[string]interface{}{
					"type":       "phone",
					"os":         "android",
					"os_version": "13",
					"id":         deviceID, // Same device
				},
				"session_id": uuid.New().String(),
			}

			resp := makeAPIRequest(t, "POST", "/v1/ad/request", publisherID, reqBody)

			// After threshold, requests should be blocked
			if i >= 100 {
				assert.Equal(t, http.StatusTooManyRequests, resp.StatusCode)
			}
		}

		// Verify fraud alert created
		waitForAsyncFlush()
		alertsResp := makeAPIRequest(t, "GET", "/v1/fraud/alerts", publisherID, nil)
		assert.Equal(t, http.StatusOK, alertsResp.StatusCode)

		var alerts map[string]interface{}
		err := json.NewDecoder(alertsResp.Body).Decode(&alerts)
		require.NoError(t, err)

		alertsList := alerts["alerts"].([]interface{})
		assert.Greater(t, len(alertsList), 0)

		// Verify alert details
		firstAlert := alertsList[0].(map[string]interface{})
		assert.Equal(t, "givt", firstAlert["type"])
		assert.Equal(t, "high", firstAlert["severity"])
	})

	// Test fraud dashboard metrics
	t.Run("Fraud Dashboard Metrics", func(t *testing.T) {
		resp := makeAPIRequest(t, "GET", "/v1/fraud/stats?window=24h", publisherID, nil)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var stats map[string]interface{}
		err := json.NewDecoder(resp.Body).Decode(&stats)
		require.NoError(t, err)

		assert.Greater(t, stats["total_traffic"], 0.0)
		assert.Greater(t, stats["fraudulent_traffic"], 0.0)
		assert.Greater(t, stats["fraud_rate"], 0.0)
	})
}

// TestPaymentProcessing tests the payment lifecycle
func TestPaymentProcessing(t *testing.T) {
	publisherID := createTestPublisher(t)

	// Setup payment method
	t.Run("Configure Payment Method", func(t *testing.T) {
		paymentMethod := map[string]interface{}{
			"type": "stripe",
			"details": map[string]interface{}{
				"account_id": "acct_test_123",
			},
		}

		resp := makeAPIRequest(t, "POST", "/v1/payments/methods", publisherID, paymentMethod)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})

	// Generate test revenue
	placementID := createTestPlacement(t, publisherID)
	generateTestRevenue(t, publisherID, placementID, 10000) // $100 in cents

	// Test ledger balance
	t.Run("Verify Ledger Balance", func(t *testing.T) {
		resp := makeAPIRequest(t, "GET", "/v1/payments/balance", publisherID, nil)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var balance map[string]interface{}
		err := json.NewDecoder(resp.Body).Decode(&balance)
		require.NoError(t, err)

		assert.Equal(t, 10000, int(balance["revenue_cents"].(float64)))
		assert.Equal(t, 0, int(balance["held_cents"].(float64)))
		assert.Equal(t, 0, int(balance["paid_cents"].(float64)))
	})

	// Create payout
	t.Run("Create Payout", func(t *testing.T) {
		payoutReq := map[string]interface{}{
			"amount_cents":   10000,
			"scheduled_date": time.Now().AddDate(0, 0, 7).Format("2006-01-02"),
		}

		resp := makeAPIRequest(t, "POST", "/v1/payments/payouts", publisherID, payoutReq)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var payout map[string]interface{}
		err := json.NewDecoder(resp.Body).Decode(&payout)
		require.NoError(t, err)

		assert.Equal(t, "pending", payout["status"])
		assert.Equal(t, "stripe", payout["method"])

		payoutID := payout["id"].(string)

		// Process payout (simulate)
		t.Run("Process Payout", func(t *testing.T) {
			processReq := map[string]interface{}{
				"payout_id": payoutID,
				"action":    "process",
			}

			processResp := makeAPIRequest(t, "POST", "/v1/payments/payouts/process", publisherID, processReq)
			assert.Equal(t, http.StatusOK, processResp.StatusCode)

			// Verify payout status updated
			waitForAsyncFlush()
			statusResp := makeAPIRequest(t, "GET", fmt.Sprintf("/v1/payments/payouts/%s", payoutID), publisherID, nil)

			var updatedPayout map[string]interface{}
			err := json.NewDecoder(statusResp.Body).Decode(&updatedPayout)
			require.NoError(t, err)

			// Should be processing or completed
			assert.Contains(t, []string{"processing", "completed"}, updatedPayout["status"])
		})

		// Verify ledger transactions
		t.Run("Verify Ledger Transactions", func(t *testing.T) {
			resp := makeAPIRequest(t, "GET", "/v1/payments/transactions?limit=10", publisherID, nil)
			assert.Equal(t, http.StatusOK, resp.StatusCode)

			var transactions map[string]interface{}
			err := json.NewDecoder(resp.Body).Decode(&transactions)
			require.NoError(t, err)

			txList := transactions["transactions"].([]interface{})
			assert.Greater(t, len(txList), 0)

			// Should have revenue and payout transactions
			types := make(map[string]bool)
			for _, tx := range txList {
				txMap := tx.(map[string]interface{})
				types[txMap["type"].(string)] = true
			}

			assert.True(t, types["revenue"])
			assert.True(t, types["payout"])
		})
	})
}

// TestSDKConfigRollout tests staged config rollout
func TestSDKConfigRollout(t *testing.T) {
	publisherID := createTestPublisher(t)

	// Create new config
	t.Run("Create Config", func(t *testing.T) {
		config := map[string]interface{}{
			"placements": []map[string]interface{}{
				{
					"id":   uuid.New().String(),
					"type": "banner",
				},
			},
			"fraud_rules": map[string]interface{}{
				"enabled": true,
			},
		}

		resp := makeAPIRequest(t, "POST", "/v1/config/versions", publisherID, config)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var created map[string]interface{}
		err := json.NewDecoder(resp.Body).Decode(&created)
		require.NoError(t, err)

		configVersion := int(created["version"].(float64))
		assert.NotEmpty(t, created["signature"]) // Ed25519 signature

		// Test staged rollout
		stages := []int{1, 5, 25, 100}
		for _, percentage := range stages {
			t.Run(fmt.Sprintf("Rollout %d%%", percentage), func(t *testing.T) {
				rolloutReq := map[string]interface{}{
					"version":    configVersion,
					"percentage": percentage,
				}

				resp := makeAPIRequest(t, "POST", "/v1/config/rollout", publisherID, rolloutReq)
				assert.Equal(t, http.StatusOK, resp.StatusCode)

				// Simulate SDK requests
				successCount := 0
				totalRequests := 100

				for i := 0; i < totalRequests; i++ {
					configResp := makeAPIRequest(t, "GET", "/v1/config/current", publisherID, nil)

					var configData map[string]interface{}
					json.NewDecoder(configResp.Body).Decode(&configData)

					if int(configData["version"].(float64)) == configVersion {
						successCount++
					}
				}

				// Should be approximately the rollout percentage
				actualPercentage := (float64(successCount) / float64(totalRequests)) * 100
				assert.InDelta(t, float64(percentage), actualPercentage, 10.0) // ±10% tolerance
			})
		}
	})
}

// TestPerformanceUnderLoad tests system performance
func TestPerformanceUnderLoad(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping load test in short mode")
	}

	publisherID := createTestPublisher(t)
	placementID := createTestPlacement(t, publisherID)

	t.Run("Concurrent Ad Requests", func(t *testing.T) {
		concurrency := 100
		requestsPerWorker := 100

		results := make(chan time.Duration, concurrency*requestsPerWorker)
		errors := make(chan error, concurrency*requestsPerWorker)

		for worker := 0; worker < concurrency; worker++ {
			go func() {
				for req := 0; req < requestsPerWorker; req++ {
					start := time.Now()

					reqBody := map[string]interface{}{
						"placement_id": placementID,
						"device": map[string]interface{}{
							"type":       "phone",
							"os":         "android",
							"os_version": "13",
							"id":         uuid.New().String(),
						},
					}

					resp := makeAPIRequest(t, "POST", "/v1/ad/request", publisherID, reqBody)
					duration := time.Since(start)

					if resp.StatusCode == http.StatusOK {
						results <- duration
					} else {
						errors <- fmt.Errorf("request failed with status %d", resp.StatusCode)
					}
				}
			}()
		}

		// Collect results
		var durations []time.Duration
		var errorCount int

		totalRequests := concurrency * requestsPerWorker
		for i := 0; i < totalRequests; i++ {
			select {
			case d := <-results:
				durations = append(durations, d)
			case <-errors:
				errorCount++
			case <-time.After(30 * time.Second):
				t.Fatal("Timeout waiting for requests to complete")
			}
		}

		// Calculate percentiles
		p50, p95, p99 := calculatePercentiles(durations)

		// Assert performance requirements
		assert.Less(t, p99.Milliseconds(), int64(150), "P99 latency should be <150ms")
		assert.Less(t, p95.Milliseconds(), int64(100), "P95 latency should be <100ms")
		assert.Less(t, p50.Milliseconds(), int64(50), "P50 latency should be <50ms")

		errorRate := float64(errorCount) / float64(totalRequests) * 100
		assert.Less(t, errorRate, 1.0, "Error rate should be <1%")

		t.Logf("Performance metrics: P50=%dms, P95=%dms, P99=%dms, Errors=%.2f%%",
			p50.Milliseconds(), p95.Milliseconds(), p99.Milliseconds(), errorRate)
	})
}
