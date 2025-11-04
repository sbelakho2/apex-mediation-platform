package compliance

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/shopspring/decimal"
	log "github.com/sirupsen/logrus"
)

// TaxInfo represents tax information for a publisher
type TaxInfo struct {
	PublisherID   string     `json:"publisher_id"`
	TaxID         string     `json:"tax_id"`      // SSN or EIN
	TaxIDType     string     `json:"tax_id_type"` // "ssn", "ein"
	LegalName     string     `json:"legal_name"`
	BusinessType  string     `json:"business_type"` // "individual", "corporation", "llc"
	Country       string     `json:"country"`
	State         string     `json:"state"`
	Address       string     `json:"address"`
	W9Submitted   bool       `json:"w9_submitted"`
	W9SubmittedAt *time.Time `json:"w9_submitted_at,omitempty"`
}

// TaxCalculation represents calculated tax
type TaxCalculation struct {
	Amount       decimal.Decimal `json:"amount"`
	TaxRate      decimal.Decimal `json:"tax_rate"`
	TaxAmount    decimal.Decimal `json:"tax_amount"`
	Currency     string          `json:"currency"`
	Jurisdiction string          `json:"jurisdiction"`
	TaxType      string          `json:"tax_type"` // "income", "vat", "sales"
}

// Form1099 represents a 1099-MISC form
type Form1099 struct {
	ID           string          `json:"id"`
	PublisherID  string          `json:"publisher_id"`
	TaxYear      int             `json:"tax_year"`
	TotalAmount  decimal.Decimal `json:"total_amount"`
	Box1         decimal.Decimal `json:"box1"` // Rents
	Box2         decimal.Decimal `json:"box2"` // Royalties
	Box3         decimal.Decimal `json:"box3"` // Other income
	Box4         decimal.Decimal `json:"box4"` // Federal income tax withheld
	PayerName    string          `json:"payer_name"`
	PayerTaxID   string          `json:"payer_tax_id"`
	PayeeName    string          `json:"payee_name"`
	PayeeTaxID   string          `json:"payee_tax_id"`
	PayeeAddress string          `json:"payee_address"`
	Status       string          `json:"status"` // "draft", "filed", "sent"
	GeneratedAt  time.Time       `json:"generated_at"`
	FiledAt      *time.Time      `json:"filed_at,omitempty"`
}

// ComplianceService handles tax compliance
type ComplianceService struct {
	redis *redis.Client

	// Payer information (our company)
	payerName  string
	payerTaxID string
}

// NewComplianceService creates a new compliance service
func NewComplianceService(redisClient *redis.Client, payerName, payerTaxID string) *ComplianceService {
	return &ComplianceService{
		redis:      redisClient,
		payerName:  payerName,
		payerTaxID: payerTaxID,
	}
}

// StoreTaxInfo stores publisher tax information
func (cs *ComplianceService) StoreTaxInfo(ctx context.Context, taxInfo *TaxInfo) error {
	key := fmt.Sprintf("tax_info:%s", taxInfo.PublisherID)

	data, err := json.Marshal(taxInfo)
	if err != nil {
		return err
	}

	if err := cs.redis.Set(ctx, key, data, 0).Err(); err != nil {
		return err
	}

	log.WithField("publisher_id", taxInfo.PublisherID).Info("Stored tax info")
	return nil
}

// GetTaxInfo retrieves publisher tax information
func (cs *ComplianceService) GetTaxInfo(ctx context.Context, publisherID string) (*TaxInfo, error) {
	key := fmt.Sprintf("tax_info:%s", publisherID)

	data, err := cs.redis.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var taxInfo TaxInfo
	if err := json.Unmarshal(data, &taxInfo); err != nil {
		return nil, err
	}

	return &taxInfo, nil
}

// Generate1099 generates a 1099-MISC form for a publisher
func (cs *ComplianceService) Generate1099(ctx context.Context, publisherID string, taxYear int) (*Form1099, error) {
	// Get tax info
	taxInfo, err := cs.GetTaxInfo(ctx, publisherID)
	if err != nil {
		return nil, fmt.Errorf("tax info not found: %w", err)
	}

	if !taxInfo.W9Submitted {
		return nil, fmt.Errorf("W-9 form not submitted")
	}

	// Calculate total payments for the year
	totalAmount, err := cs.calculateYearlyPayments(ctx, publisherID, taxYear)
	if err != nil {
		return nil, err
	}

	// Check minimum threshold ($600 for 1099)
	threshold := decimal.NewFromInt(600)
	if totalAmount.LessThan(threshold) {
		return nil, fmt.Errorf("total payments ($%s) below 1099 threshold ($600)", totalAmount)
	}

	// Generate form
	form1099 := &Form1099{
		ID:           fmt.Sprintf("1099_%s_%d", publisherID, taxYear),
		PublisherID:  publisherID,
		TaxYear:      taxYear,
		TotalAmount:  totalAmount,
		Box3:         totalAmount, // Other income (most appropriate for ad revenue)
		PayerName:    cs.payerName,
		PayerTaxID:   cs.payerTaxID,
		PayeeName:    taxInfo.LegalName,
		PayeeTaxID:   taxInfo.TaxID,
		PayeeAddress: taxInfo.Address,
		Status:       "draft",
		GeneratedAt:  time.Now(),
	}

	// Store form
	if err := cs.store1099(ctx, form1099); err != nil {
		return nil, err
	}

	log.WithFields(log.Fields{
		"publisher_id": publisherID,
		"tax_year":     taxYear,
		"amount":       totalAmount,
		"form_id":      form1099.ID,
	}).Info("Generated 1099 form")

	return form1099, nil
}

// Get1099 retrieves a 1099 form
func (cs *ComplianceService) Get1099(ctx context.Context, form1099ID string) (*Form1099, error) {
	key := fmt.Sprintf("1099:%s", form1099ID)

	data, err := cs.redis.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var form Form1099
	if err := json.Unmarshal(data, &form); err != nil {
		return nil, err
	}

	return &form, nil
}

// List1099Forms lists all 1099 forms for a publisher
func (cs *ComplianceService) List1099Forms(ctx context.Context, publisherID string) ([]Form1099, error) {
	listKey := fmt.Sprintf("1099s:%s", publisherID)

	formIDs, err := cs.redis.SMembers(ctx, listKey).Result()
	if err != nil {
		return nil, err
	}

	var forms []Form1099
	for _, formID := range formIDs {
		form, err := cs.Get1099(ctx, formID)
		if err != nil {
			log.WithError(err).Warn("Failed to fetch 1099 form")
			continue
		}
		forms = append(forms, *form)
	}

	return forms, nil
}

// File1099 marks a 1099 form as filed
func (cs *ComplianceService) File1099(ctx context.Context, form1099ID string) error {
	form, err := cs.Get1099(ctx, form1099ID)
	if err != nil {
		return err
	}

	now := time.Now()
	form.Status = "filed"
	form.FiledAt = &now

	if err := cs.store1099(ctx, form); err != nil {
		return err
	}

	log.WithField("form_id", form1099ID).Info("Filed 1099 form")
	return nil
}

// CalculateTax calculates tax for a payment amount
// This is a simplified implementation - in production would integrate with Avalara
func (cs *ComplianceService) CalculateTax(ctx context.Context, publisherID string, amount decimal.Decimal, currency string) (*TaxCalculation, error) {
	taxInfo, err := cs.GetTaxInfo(ctx, publisherID)
	if err != nil {
		// If no tax info, assume no tax withholding
		return &TaxCalculation{
			Amount:       amount,
			TaxRate:      decimal.Zero,
			TaxAmount:    decimal.Zero,
			Currency:     currency,
			Jurisdiction: "US",
			TaxType:      "none",
		}, nil
	}

	// Apply tax rules based on location
	var taxRate decimal.Decimal
	var jurisdiction string
	var taxType string

	switch taxInfo.Country {
	case "US":
		// US publishers - no withholding for domestic
		taxRate = decimal.Zero
		jurisdiction = "US"
		taxType = "none"

	case "GB", "DE", "FR": // EU countries
		// VAT withholding for EU publishers
		taxRate = decimal.NewFromFloat(0.20) // 20% VAT
		jurisdiction = taxInfo.Country
		taxType = "vat"

	default:
		// International - 30% withholding tax
		taxRate = decimal.NewFromFloat(0.30)
		jurisdiction = taxInfo.Country
		taxType = "withholding"
	}

	taxAmount := amount.Mul(taxRate)

	return &TaxCalculation{
		Amount:       amount,
		TaxRate:      taxRate,
		TaxAmount:    taxAmount,
		Currency:     currency,
		Jurisdiction: jurisdiction,
		TaxType:      taxType,
	}, nil
}

// Internal methods

func (cs *ComplianceService) calculateYearlyPayments(ctx context.Context, publisherID string, taxYear int) (decimal.Decimal, error) {
	// This would query the ledger for all payments in the tax year
	// For now, using a placeholder

	// Get all transactions for publisher
	txListKey := fmt.Sprintf("transactions:%s", publisherID)
	txIDs, err := cs.redis.ZRevRange(ctx, txListKey, 0, -1).Result()
	if err != nil {
		return decimal.Zero, err
	}

	total := decimal.Zero

	for _, txID := range txIDs {
		txKey := fmt.Sprintf("transaction:%s", txID)
		txData, err := cs.redis.Get(ctx, txKey).Bytes()
		if err != nil {
			continue
		}

		var tx map[string]interface{}
		json.Unmarshal(txData, &tx)

		// Check if transaction is a debit (payout) in the tax year
		if tx["type"] == "debit" {
			createdAt := tx["created_at"].(string)
			txTime, _ := time.Parse(time.RFC3339, createdAt)

			if txTime.Year() == taxYear {
				amount, _ := decimal.NewFromString(tx["amount"].(string))
				total = total.Add(amount)
			}
		}
	}

	return total, nil
}

func (cs *ComplianceService) store1099(ctx context.Context, form *Form1099) error {
	key := fmt.Sprintf("1099:%s", form.ID)

	data, err := json.Marshal(form)
	if err != nil {
		return err
	}

	// Store form
	if err := cs.redis.Set(ctx, key, data, 0).Err(); err != nil {
		return err
	}

	// Add to publisher's 1099 list
	listKey := fmt.Sprintf("1099s:%s", form.PublisherID)
	if err := cs.redis.SAdd(ctx, listKey, form.ID).Err(); err != nil {
		return err
	}

	return nil
}

// MultiCurrencySupport handles currency conversion
type MultiCurrencySupport struct {
	redis *redis.Client
}

// NewMultiCurrencySupport creates a new multi-currency support
func NewMultiCurrencySupport(redisClient *redis.Client) *MultiCurrencySupport {
	return &MultiCurrencySupport{
		redis: redisClient,
	}
}

// GetExchangeRate gets exchange rate between currencies
func (mcs *MultiCurrencySupport) GetExchangeRate(ctx context.Context, from, to string) (decimal.Decimal, error) {
	if from == to {
		return decimal.NewFromInt(1), nil
	}

	key := fmt.Sprintf("exchange_rate:%s_%s", from, to)

	rateStr, err := mcs.redis.Get(ctx, key).Result()
	if err != nil {
		// Return a default rate if not cached
		// In production, would fetch from forex API
		return mcs.getDefaultRate(from, to), nil
	}

	rate, err := decimal.NewFromString(rateStr)
	if err != nil {
		return decimal.Zero, err
	}

	return rate, nil
}

// ConvertCurrency converts amount from one currency to another
func (mcs *MultiCurrencySupport) ConvertCurrency(ctx context.Context, amount decimal.Decimal, from, to string) (decimal.Decimal, error) {
	rate, err := mcs.GetExchangeRate(ctx, from, to)
	if err != nil {
		return decimal.Zero, err
	}

	return amount.Mul(rate), nil
}

// UpdateExchangeRate updates exchange rate
func (mcs *MultiCurrencySupport) UpdateExchangeRate(ctx context.Context, from, to string, rate decimal.Decimal) error {
	key := fmt.Sprintf("exchange_rate:%s_%s", from, to)

	if err := mcs.redis.Set(ctx, key, rate.String(), 24*time.Hour).Err(); err != nil {
		return err
	}

	log.WithFields(log.Fields{
		"from": from,
		"to":   to,
		"rate": rate,
	}).Info("Updated exchange rate")

	return nil
}

func (mcs *MultiCurrencySupport) getDefaultRate(from, to string) decimal.Decimal {
	// Default exchange rates (would fetch from API in production)
	rates := map[string]map[string]float64{
		"USD": {"EUR": 0.85, "GBP": 0.73, "JPY": 110.0},
		"EUR": {"USD": 1.18, "GBP": 0.86, "JPY": 129.5},
		"GBP": {"USD": 1.37, "EUR": 1.16, "JPY": 150.7},
	}

	if fromRates, ok := rates[from]; ok {
		if rate, ok := fromRates[to]; ok {
			return decimal.NewFromFloat(rate)
		}
	}

	return decimal.NewFromInt(1)
}
