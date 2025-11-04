package clickhouse

import (
	"context"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	log "github.com/sirupsen/logrus"
)

// ImpressionEvent represents an ad impression event
type ImpressionEvent struct {
	EventID     string    `json:"event_id"`
	PublisherID string    `json:"publisher_id"`
	PlacementID string    `json:"placement_id"`
	AdapterID   string    `json:"adapter_id"`
	AdFormat    string    `json:"ad_format"`
	Country     string    `json:"country"`
	Region      string    `json:"region"`
	DeviceType  string    `json:"device_type"`
	OSType      string    `json:"os_type"`
	Revenue     float64   `json:"revenue"`
	Currency    string    `json:"currency"`
	Timestamp   time.Time `json:"timestamp"`
	LatencyMs   int64     `json:"latency_ms"`
	Success     bool      `json:"success"`
}

// ClickEvent represents an ad click event
type ClickEvent struct {
	EventID      string    `json:"event_id"`
	ImpressionID string    `json:"impression_id"`
	PublisherID  string    `json:"publisher_id"`
	PlacementID  string    `json:"placement_id"`
	AdapterID    string    `json:"adapter_id"`
	Timestamp    time.Time `json:"timestamp"`
}

// ClickHouseClient wraps ClickHouse connection
type ClickHouseClient struct {
	conn driver.Conn
}

// NewClickHouseClient creates a new ClickHouse client
func NewClickHouseClient(addr string) (*ClickHouseClient, error) {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{addr},
		Auth: clickhouse.Auth{
			Database: "analytics",
			Username: "default",
			Password: "",
		},
		Settings: clickhouse.Settings{
			"max_execution_time": 60,
		},
		DialTimeout: 5 * time.Second,
		Compression: &clickhouse.Compression{
			Method: clickhouse.CompressionLZ4,
		},
	})

	if err != nil {
		return nil, err
	}

	// Test connection
	if err := conn.Ping(context.Background()); err != nil {
		return nil, err
	}

	log.Info("Connected to ClickHouse")

	client := &ClickHouseClient{conn: conn}

	// Initialize schema
	if err := client.initSchema(context.Background()); err != nil {
		log.WithError(err).Warn("Schema initialization skipped")
	}

	return client, nil
}

// Close closes the ClickHouse connection
func (c *ClickHouseClient) Close() error {
	return c.conn.Close()
}

// initSchema initializes ClickHouse tables
func (c *ClickHouseClient) initSchema(ctx context.Context) error {
	// Create impressions table
	impressionsSQL := `
	CREATE TABLE IF NOT EXISTS impressions (
		event_id String,
		publisher_id String,
		placement_id String,
		adapter_id String,
		ad_format String,
		country String,
		region String,
		device_type String,
		os_type String,
		revenue Float64,
		currency String,
		timestamp DateTime,
		latency_ms Int64,
		success UInt8,
		date Date MATERIALIZED toDate(timestamp)
	) ENGINE = MergeTree()
	PARTITION BY toYYYYMM(date)
	ORDER BY (publisher_id, date, timestamp)
	TTL date + INTERVAL 90 DAY
	`

	if err := c.conn.Exec(ctx, impressionsSQL); err != nil {
		return err
	}

	// Create clicks table
	clicksSQL := `
	CREATE TABLE IF NOT EXISTS clicks (
		event_id String,
		impression_id String,
		publisher_id String,
		placement_id String,
		adapter_id String,
		timestamp DateTime,
		date Date MATERIALIZED toDate(timestamp)
	) ENGINE = MergeTree()
	PARTITION BY toYYYYMM(date)
	ORDER BY (publisher_id, date, timestamp)
	TTL date + INTERVAL 90 DAY
	`

	if err := c.conn.Exec(ctx, clicksSQL); err != nil {
		return err
	}

	log.Info("ClickHouse schema initialized")
	return nil
}

// InsertImpression inserts an impression event
func (c *ClickHouseClient) InsertImpression(ctx context.Context, event ImpressionEvent) error {
	batch, err := c.conn.PrepareBatch(ctx, "INSERT INTO impressions")
	if err != nil {
		return err
	}

	successInt := uint8(0)
	if event.Success {
		successInt = 1
	}

	err = batch.Append(
		event.EventID,
		event.PublisherID,
		event.PlacementID,
		event.AdapterID,
		event.AdFormat,
		event.Country,
		event.Region,
		event.DeviceType,
		event.OSType,
		event.Revenue,
		event.Currency,
		event.Timestamp,
		event.LatencyMs,
		successInt,
	)

	if err != nil {
		return err
	}

	return batch.Send()
}

// InsertClick inserts a click event
func (c *ClickHouseClient) InsertClick(ctx context.Context, event ClickEvent) error {
	batch, err := c.conn.PrepareBatch(ctx, "INSERT INTO clicks")
	if err != nil {
		return err
	}

	err = batch.Append(
		event.EventID,
		event.ImpressionID,
		event.PublisherID,
		event.PlacementID,
		event.AdapterID,
		event.Timestamp,
	)

	if err != nil {
		return err
	}

	return batch.Send()
}

// GetPublisherRevenue gets revenue for a publisher in a time range
func (c *ClickHouseClient) GetPublisherRevenue(ctx context.Context, publisherID string, startDate, endDate time.Time) (float64, error) {
	var revenue float64

	query := `
		SELECT sum(revenue) as total_revenue
		FROM impressions
		WHERE publisher_id = ?
		  AND timestamp >= ?
		  AND timestamp <= ?
		  AND success = 1
	`

	row := c.conn.QueryRow(ctx, query, publisherID, startDate, endDate)
	if err := row.Scan(&revenue); err != nil {
		return 0, err
	}

	return revenue, nil
}

// GetPublisherStats gets aggregated stats for a publisher
func (c *ClickHouseClient) GetPublisherStats(ctx context.Context, publisherID string, startDate, endDate time.Time) (map[string]interface{}, error) {
	query := `
		SELECT
			count(*) as impressions,
			sum(revenue) as total_revenue,
			avg(revenue) as avg_revenue,
			avg(latency_ms) as avg_latency,
			countIf(success = 1) as successful_impressions,
			countIf(success = 0) as failed_impressions
		FROM impressions
		WHERE publisher_id = ?
		  AND timestamp >= ?
		  AND timestamp <= ?
	`

	var (
		impressions           uint64
		totalRevenue          float64
		avgRevenue            float64
		avgLatency            float64
		successfulImpressions uint64
		failedImpressions     uint64
	)

	row := c.conn.QueryRow(ctx, query, publisherID, startDate, endDate)
	if err := row.Scan(&impressions, &totalRevenue, &avgRevenue, &avgLatency, &successfulImpressions, &failedImpressions); err != nil {
		return nil, err
	}

	// Get clicks
	clicksQuery := `
		SELECT count(*) as clicks
		FROM clicks
		WHERE publisher_id = ?
		  AND timestamp >= ?
		  AND timestamp <= ?
	`

	var clicks uint64
	clickRow := c.conn.QueryRow(ctx, clicksQuery, publisherID, startDate, endDate)
	if err := clickRow.Scan(&clicks); err != nil {
		clicks = 0
	}

	// Calculate metrics
	fillRate := 0.0
	if impressions > 0 {
		fillRate = float64(successfulImpressions) / float64(impressions)
	}

	ctr := 0.0
	if successfulImpressions > 0 {
		ctr = float64(clicks) / float64(successfulImpressions)
	}

	cpm := 0.0
	if successfulImpressions > 0 {
		cpm = (totalRevenue / float64(successfulImpressions)) * 1000
	}

	return map[string]interface{}{
		"impressions":            impressions,
		"successful_impressions": successfulImpressions,
		"failed_impressions":     failedImpressions,
		"clicks":                 clicks,
		"total_revenue":          totalRevenue,
		"avg_revenue":            avgRevenue,
		"avg_latency_ms":         avgLatency,
		"fill_rate":              fillRate,
		"ctr":                    ctr,
		"cpm":                    cpm,
	}, nil
}

// GetRevenueByDate gets daily revenue breakdown
func (c *ClickHouseClient) GetRevenueByDate(ctx context.Context, publisherID string, startDate, endDate time.Time) ([]map[string]interface{}, error) {
	query := `
		SELECT
			toDate(timestamp) as date,
			count(*) as impressions,
			sum(revenue) as revenue,
			avg(latency_ms) as avg_latency
		FROM impressions
		WHERE publisher_id = ?
		  AND timestamp >= ?
		  AND timestamp <= ?
		  AND success = 1
		GROUP BY date
		ORDER BY date
	`

	rows, err := c.conn.Query(ctx, query, publisherID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}

	for rows.Next() {
		var (
			date        time.Time
			impressions uint64
			revenue     float64
			avgLatency  float64
		)

		if err := rows.Scan(&date, &impressions, &revenue, &avgLatency); err != nil {
			return nil, err
		}

		results = append(results, map[string]interface{}{
			"date":        date.Format("2006-01-02"),
			"impressions": impressions,
			"revenue":     revenue,
			"avg_latency": avgLatency,
		})
	}

	return results, nil
}

// GetTopPerformingPlacements gets top placements by revenue
func (c *ClickHouseClient) GetTopPerformingPlacements(ctx context.Context, publisherID string, limit int, startDate, endDate time.Time) ([]map[string]interface{}, error) {
	query := `
		SELECT
			placement_id,
			count(*) as impressions,
			sum(revenue) as total_revenue,
			avg(revenue) as avg_revenue
		FROM impressions
		WHERE publisher_id = ?
		  AND timestamp >= ?
		  AND timestamp <= ?
		  AND success = 1
		GROUP BY placement_id
		ORDER BY total_revenue DESC
		LIMIT ?
	`

	rows, err := c.conn.Query(ctx, query, publisherID, startDate, endDate, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}

	for rows.Next() {
		var (
			placementID  string
			impressions  uint64
			totalRevenue float64
			avgRevenue   float64
		)

		if err := rows.Scan(&placementID, &impressions, &totalRevenue, &avgRevenue); err != nil {
			return nil, err
		}

		results = append(results, map[string]interface{}{
			"placement_id":  placementID,
			"impressions":   impressions,
			"total_revenue": totalRevenue,
			"avg_revenue":   avgRevenue,
		})
	}

	return results, nil
}

// GetAdapterPerformance gets adapter performance metrics
func (c *ClickHouseClient) GetAdapterPerformance(ctx context.Context, startDate, endDate time.Time) ([]map[string]interface{}, error) {
	query := `
		SELECT
			adapter_id,
			count(*) as total_requests,
			countIf(success = 1) as successful_requests,
			sum(revenue) as total_revenue,
			avg(latency_ms) as avg_latency
		FROM impressions
		WHERE timestamp >= ?
		  AND timestamp <= ?
		GROUP BY adapter_id
		ORDER BY total_revenue DESC
	`

	rows, err := c.conn.Query(ctx, query, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}

	for rows.Next() {
		var (
			adapterID          string
			totalRequests      uint64
			successfulRequests uint64
			totalRevenue       float64
			avgLatency         float64
		)

		if err := rows.Scan(&adapterID, &totalRequests, &successfulRequests, &totalRevenue, &avgLatency); err != nil {
			return nil, err
		}

		fillRate := 0.0
		if totalRequests > 0 {
			fillRate = float64(successfulRequests) / float64(totalRequests)
		}

		results = append(results, map[string]interface{}{
			"adapter_id":          adapterID,
			"total_requests":      totalRequests,
			"successful_requests": successfulRequests,
			"total_revenue":       totalRevenue,
			"avg_latency_ms":      avgLatency,
			"fill_rate":           fillRate,
		})
	}

	return results, nil
}
