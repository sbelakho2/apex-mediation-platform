package analytics

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/shopspring/decimal"
	log "github.com/sirupsen/logrus"
)

// RevenueMetrics tracks revenue analytics
type RevenueMetrics struct {
	PublisherID  string          `json:"publisher_id"`
	Period       string          `json:"period"` // daily, weekly, monthly
	Date         string          `json:"date"`
	TotalRevenue decimal.Decimal `json:"total_revenue"`
	Impressions  int64           `json:"impressions"`
	Clicks       int64           `json:"clicks"`
	AvgCPM       decimal.Decimal `json:"avg_cpm"`
	AvgCPC       decimal.Decimal `json:"avg_cpc"`
	CTR          float64         `json:"ctr"` // Click-through rate
	FillRate     float64         `json:"fill_rate"`
	Currency     string          `json:"currency"`
}

// BalanceSummary shows current balance state
type BalanceSummary struct {
	PublisherID    string          `json:"publisher_id"`
	CurrentBalance decimal.Decimal `json:"current_balance"`
	PendingPayouts decimal.Decimal `json:"pending_payouts"`
	TotalEarned    decimal.Decimal `json:"total_earned"`
	TotalPaidOut   decimal.Decimal `json:"total_paid_out"`
	Currency       string          `json:"currency"`
	LastPayoutDate *time.Time      `json:"last_payout_date,omitempty"`
	NextPayoutDate *time.Time      `json:"next_payout_date,omitempty"`
}

// Invoice represents a payment invoice
type Invoice struct {
	ID          string            `json:"id"`
	PublisherID string            `json:"publisher_id"`
	Period      string            `json:"period"`
	StartDate   time.Time         `json:"start_date"`
	EndDate     time.Time         `json:"end_date"`
	TotalAmount decimal.Decimal   `json:"total_amount"`
	Currency    string            `json:"currency"`
	Status      string            `json:"status"` // draft, issued, paid
	CreatedAt   time.Time         `json:"created_at"`
	PaidAt      *time.Time        `json:"paid_at,omitempty"`
	LineItems   []InvoiceLineItem `json:"line_items"`
}

// InvoiceLineItem represents a line item in an invoice
type InvoiceLineItem struct {
	Description string          `json:"description"`
	Quantity    int64           `json:"quantity"`
	Rate        decimal.Decimal `json:"rate"`
	Amount      decimal.Decimal `json:"amount"`
}

// AnalyticsService provides payment analytics
type AnalyticsService struct {
	redis *redis.Client
}

// NewAnalyticsService creates a new analytics service
func NewAnalyticsService(redisClient *redis.Client) *AnalyticsService {
	return &AnalyticsService{
		redis: redisClient,
	}
}

// RecordImpression records an ad impression for analytics
func (as *AnalyticsService) RecordImpression(ctx context.Context, publisherID string, revenue decimal.Decimal, currency string) error {
	today := time.Now().Format("2006-01-02")

	// Increment impression count
	impKey := fmt.Sprintf("analytics:impressions:%s:%s", publisherID, today)
	if err := as.redis.Incr(ctx, impKey).Err(); err != nil {
		return err
	}
	as.redis.Expire(ctx, impKey, 90*24*time.Hour) // Keep 90 days

	// Add revenue
	revKey := fmt.Sprintf("analytics:revenue:%s:%s", publisherID, today)
	current, _ := as.redis.Get(ctx, revKey).Result()
	currentRev, _ := decimal.NewFromString(current)
	newRev := currentRev.Add(revenue)

	if err := as.redis.Set(ctx, revKey, newRev.String(), 90*24*time.Hour).Err(); err != nil {
		return err
	}

	log.WithFields(log.Fields{
		"publisher_id": publisherID,
		"revenue":      revenue,
	}).Debug("Recorded impression analytics")

	return nil
}

// RecordClick records an ad click for analytics
func (as *AnalyticsService) RecordClick(ctx context.Context, publisherID string) error {
	today := time.Now().Format("2006-01-02")

	key := fmt.Sprintf("analytics:clicks:%s:%s", publisherID, today)
	if err := as.redis.Incr(ctx, key).Err(); err != nil {
		return err
	}
	as.redis.Expire(ctx, key, 90*24*time.Hour)

	return nil
}

// GetRevenueMetrics gets revenue metrics for a period
func (as *AnalyticsService) GetRevenueMetrics(ctx context.Context, publisherID, period string, date time.Time) (*RevenueMetrics, error) {
	dateStr := date.Format("2006-01-02")

	// Get impressions
	impKey := fmt.Sprintf("analytics:impressions:%s:%s", publisherID, dateStr)
	impressions, _ := as.redis.Get(ctx, impKey).Int64()

	// Get clicks
	clickKey := fmt.Sprintf("analytics:clicks:%s:%s", publisherID, dateStr)
	clicks, _ := as.redis.Get(ctx, clickKey).Int64()

	// Get revenue
	revKey := fmt.Sprintf("analytics:revenue:%s:%s", publisherID, dateStr)
	revenueStr, _ := as.redis.Get(ctx, revKey).Result()
	revenue, _ := decimal.NewFromString(revenueStr)

	// Calculate metrics
	var avgCPM, avgCPC decimal.Decimal
	var ctr float64

	if impressions > 0 {
		avgCPM = revenue.Mul(decimal.NewFromInt(1000)).Div(decimal.NewFromInt(impressions))
		ctr = float64(clicks) / float64(impressions)
	}

	if clicks > 0 {
		avgCPC = revenue.Div(decimal.NewFromInt(clicks))
	}

	metrics := &RevenueMetrics{
		PublisherID:  publisherID,
		Period:       period,
		Date:         dateStr,
		TotalRevenue: revenue,
		Impressions:  impressions,
		Clicks:       clicks,
		AvgCPM:       avgCPM,
		AvgCPC:       avgCPC,
		CTR:          ctr,
		FillRate:     0.95, // TODO: Calculate from ad requests
		Currency:     "USD",
	}

	return metrics, nil
}

// GetBalanceSummary gets balance summary for a publisher
func (as *AnalyticsService) GetBalanceSummary(ctx context.Context, publisherID, currency string) (*BalanceSummary, error) {
	// Get current balance
	balanceKey := fmt.Sprintf("balance:%s:%s", publisherID, currency)
	balanceStr, _ := as.redis.Get(ctx, balanceKey).Result()
	currentBalance, _ := decimal.NewFromString(balanceStr)

	// Get total earned (sum of all credit transactions)
	totalEarned := decimal.Zero
	txListKey := fmt.Sprintf("transactions:%s", publisherID)
	txIDs, _ := as.redis.ZRevRange(ctx, txListKey, 0, -1).Result()

	for _, txID := range txIDs {
		txKey := fmt.Sprintf("transaction:%s", txID)
		txData, err := as.redis.Get(ctx, txKey).Bytes()
		if err != nil {
			continue
		}

		var tx map[string]interface{}
		json.Unmarshal(txData, &tx)

		if tx["type"] == "credit" {
			amount, _ := decimal.NewFromString(tx["amount"].(string))
			totalEarned = totalEarned.Add(amount)
		}
	}

	// Calculate total paid out
	totalPaidOut := totalEarned.Sub(currentBalance)

	summary := &BalanceSummary{
		PublisherID:    publisherID,
		CurrentBalance: currentBalance,
		PendingPayouts: decimal.Zero, // TODO: Calculate from pending payouts
		TotalEarned:    totalEarned,
		TotalPaidOut:   totalPaidOut,
		Currency:       currency,
	}

	return summary, nil
}

// GenerateInvoice generates an invoice for a period
func (as *AnalyticsService) GenerateInvoice(ctx context.Context, publisherID string, startDate, endDate time.Time) (*Invoice, error) {
	invoiceID := fmt.Sprintf("inv_%s_%d", publisherID, time.Now().UnixNano())

	// Collect metrics for the period
	var lineItems []InvoiceLineItem
	totalAmount := decimal.Zero
	totalImpressions := int64(0)

	// Iterate through days in period
	for d := startDate; d.Before(endDate) || d.Equal(endDate); d = d.AddDate(0, 0, 1) {
		metrics, _ := as.GetRevenueMetrics(ctx, publisherID, "daily", d)

		if metrics.TotalRevenue.GreaterThan(decimal.Zero) {
			lineItems = append(lineItems, InvoiceLineItem{
				Description: fmt.Sprintf("Ad Revenue - %s", d.Format("2006-01-02")),
				Quantity:    metrics.Impressions,
				Rate:        metrics.AvgCPM,
				Amount:      metrics.TotalRevenue,
			})

			totalAmount = totalAmount.Add(metrics.TotalRevenue)
			totalImpressions += metrics.Impressions
		}
	}

	invoice := &Invoice{
		ID:          invoiceID,
		PublisherID: publisherID,
		Period:      fmt.Sprintf("%s to %s", startDate.Format("2006-01-02"), endDate.Format("2006-01-02")),
		StartDate:   startDate,
		EndDate:     endDate,
		TotalAmount: totalAmount,
		Currency:    "USD",
		Status:      "issued",
		CreatedAt:   time.Now(),
		LineItems:   lineItems,
	}

	// Store invoice
	if err := as.storeInvoice(ctx, invoice); err != nil {
		return nil, err
	}

	log.WithFields(log.Fields{
		"invoice_id":   invoiceID,
		"publisher_id": publisherID,
		"amount":       totalAmount,
		"impressions":  totalImpressions,
	}).Info("Generated invoice")

	return invoice, nil
}

// GetInvoice retrieves an invoice
func (as *AnalyticsService) GetInvoice(ctx context.Context, invoiceID string) (*Invoice, error) {
	key := fmt.Sprintf("invoice:%s", invoiceID)

	data, err := as.redis.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var invoice Invoice
	if err := json.Unmarshal(data, &invoice); err != nil {
		return nil, err
	}

	return &invoice, nil
}

// ListInvoices lists invoices for a publisher
func (as *AnalyticsService) ListInvoices(ctx context.Context, publisherID string, limit int) ([]Invoice, error) {
	// Get invoice IDs for publisher
	listKey := fmt.Sprintf("invoices:%s", publisherID)
	invoiceIDs, err := as.redis.ZRevRange(ctx, listKey, 0, int64(limit-1)).Result()
	if err != nil {
		return nil, err
	}

	var invoices []Invoice
	for _, id := range invoiceIDs {
		invoice, err := as.GetInvoice(ctx, id)
		if err != nil {
			log.WithError(err).Warn("Failed to fetch invoice")
			continue
		}
		invoices = append(invoices, *invoice)
	}

	return invoices, nil
}

// Internal methods

func (as *AnalyticsService) storeInvoice(ctx context.Context, invoice *Invoice) error {
	key := fmt.Sprintf("invoice:%s", invoice.ID)

	data, err := json.Marshal(invoice)
	if err != nil {
		return err
	}

	// Store invoice
	if err := as.redis.Set(ctx, key, data, 0).Err(); err != nil {
		return err
	}

	// Add to publisher's invoice list
	listKey := fmt.Sprintf("invoices:%s", invoice.PublisherID)
	score := float64(invoice.CreatedAt.Unix())
	if err := as.redis.ZAdd(ctx, listKey, redis.Z{Score: score, Member: invoice.ID}).Err(); err != nil {
		return err
	}

	return nil
}

// ReconciliationReport tracks payment reconciliation
type ReconciliationReport struct {
	PublisherID        string          `json:"publisher_id"`
	Period             string          `json:"period"`
	ExpectedRevenue    decimal.Decimal `json:"expected_revenue"`
	RecordedRevenue    decimal.Decimal `json:"recorded_revenue"`
	Discrepancy        decimal.Decimal `json:"discrepancy"`
	DiscrepancyPercent float64         `json:"discrepancy_percent"`
	Status             string          `json:"status"` // reconciled, discrepancy
}

// GenerateReconciliationReport generates a reconciliation report
func (as *AnalyticsService) GenerateReconciliationReport(ctx context.Context, publisherID string, startDate, endDate time.Time) (*ReconciliationReport, error) {
	// Calculate expected revenue from analytics
	expectedRevenue := decimal.Zero
	for d := startDate; d.Before(endDate) || d.Equal(endDate); d = d.AddDate(0, 0, 1) {
		metrics, _ := as.GetRevenueMetrics(ctx, publisherID, "daily", d)
		expectedRevenue = expectedRevenue.Add(metrics.TotalRevenue)
	}

	// Get recorded revenue from ledger
	// This would query the ledger for actual recorded transactions
	recordedRevenue := expectedRevenue // Placeholder

	// Calculate discrepancy
	discrepancy := expectedRevenue.Sub(recordedRevenue)
	discrepancyPercent := 0.0
	if !expectedRevenue.IsZero() {
		discrepancyPercent = discrepancy.Div(expectedRevenue).Mul(decimal.NewFromInt(100)).InexactFloat64()
	}

	status := "reconciled"
	if discrepancy.Abs().GreaterThan(decimal.NewFromFloat(0.01)) {
		status = "discrepancy"
	}

	report := &ReconciliationReport{
		PublisherID:        publisherID,
		Period:             fmt.Sprintf("%s to %s", startDate.Format("2006-01-02"), endDate.Format("2006-01-02")),
		ExpectedRevenue:    expectedRevenue,
		RecordedRevenue:    recordedRevenue,
		Discrepancy:        discrepancy,
		DiscrepancyPercent: discrepancyPercent,
		Status:             status,
	}

	log.WithFields(log.Fields{
		"publisher_id": publisherID,
		"expected":     expectedRevenue,
		"recorded":     recordedRevenue,
		"discrepancy":  discrepancy,
		"status":       status,
	}).Info("Generated reconciliation report")

	return report, nil
}
