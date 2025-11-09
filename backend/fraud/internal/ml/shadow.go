package ml

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"

	clickhouse "github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/google/uuid"
)

// ShadowScoreEvent represents a single shadow scoring inference that should be persisted.
type ShadowScoreEvent struct {
	RequestID    string    `json:"request_id"`
	PlacementID  string    `json:"placement_id"`
	PartnerID    string    `json:"partner_id"`
	Score        float64   `json:"score"`
	Threshold    float64   `json:"threshold"`
	Decision     string    `json:"decision"`
	WeakLabel    *bool     `json:"weak_label,omitempty"`
	ModelVersion string    `json:"model_version"`
	GeneratedAt  time.Time `json:"generated_at"`
	LatencyMS    float64   `json:"latency_ms"`
}

// ShadowScoreMetadata carries the non-feature context required for logging shadow events.
type ShadowScoreMetadata struct {
	RequestID   string
	PlacementID string
	PartnerID   string
	WeakLabel   *bool
	GeneratedAt time.Time
}

// LogisticModel captures a calibrated logistic regression model snapshot.
type LogisticModel struct {
	Weights   map[string]float64 `json:"weights"`
	Bias      float64            `json:"bias"`
	Version   string             `json:"version"`
	Threshold float64            `json:"threshold"`
}

// ShadowSink describes a persistence backend for shadow scores.
type ShadowSink interface {
	Write(ctx context.Context, event ShadowScoreEvent) error
}

type clickHouseShadowSink struct {
	conn driver.Conn
}

// NewClickHouseShadowSink creates a ClickHouse writer for the shadow scoring table.
func NewClickHouseShadowSink(dsn string) (ShadowSink, error) {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr:        []string{dsn},
		Auth:        clickhouse.Auth{Database: "analytics", Username: "default", Password: ""},
		Compression: &clickhouse.Compression{Method: clickhouse.CompressionLZ4},
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		return nil, err
	}

	if err := conn.Ping(context.Background()); err != nil {
		return nil, err
	}

	sink := &clickHouseShadowSink{conn: conn}
	if err := sink.initSchema(context.Background()); err != nil {
		return nil, err
	}
	return sink, nil
}

func (c *clickHouseShadowSink) initSchema(ctx context.Context) error {
	ddl := `
	CREATE TABLE IF NOT EXISTS fraud_shadow_scores (
		record_id UUID,
		request_id String,
		placement_id String,
		partner_id String,
		score Float64,
		threshold Float64,
		decision String,
		weak_label Nullable(UInt8),
		model_version String,
		generated_at DateTime,
		latency_ms Float64,
		date Date MATERIALIZED toDate(generated_at)
	) ENGINE = MergeTree()
	PARTITION BY toYYYYMM(date)
	ORDER BY (placement_id, generated_at)
	TTL date + INTERVAL 90 DAY
	`
	return c.conn.Exec(ctx, ddl)
}

func (c *clickHouseShadowSink) Write(ctx context.Context, event ShadowScoreEvent) error {
	batch, err := c.conn.PrepareBatch(ctx, "INSERT INTO fraud_shadow_scores")
	if err != nil {
		return err
	}

	var weakLabel *uint8
	if event.WeakLabel != nil {
		value := uint8(0)
		if *event.WeakLabel {
			value = 1
		}
		weakLabel = &value
	}

	if err := batch.Append(
		uuid.New(),
		event.RequestID,
		event.PlacementID,
		event.PartnerID,
		event.Score,
		event.Threshold,
		event.Decision,
		weakLabel,
		event.ModelVersion,
		event.GeneratedAt,
		event.LatencyMS,
	); err != nil {
		return err
	}

	return batch.Send()
}

// logistic computes prediction from weights and bias.
func logistic(model LogisticModel, features map[string]float64) float64 {
	sum := model.Bias
	for feature, weight := range model.Weights {
		if value, ok := features[feature]; ok {
			sum += weight * value
		}
	}
	return 1.0 / (1.0 + math.Exp(-sum))
}

// LoadLogisticModel loads a model artifact (trained_fraud_model.json) from disk.
func LoadLogisticModel(path string) (LogisticModel, error) {
	payload, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		return LogisticModel{}, err
	}
	var tmp struct {
		Weights   map[string]float64 `json:"weights"`
		Bias      float64            `json:"bias"`
		Version   string             `json:"version"`
		Threshold float64            `json:"threshold"`
	}
	if err := json.Unmarshal(payload, &tmp); err != nil {
		return LogisticModel{}, err
	}
	if len(tmp.Weights) == 0 {
		return LogisticModel{}, errors.New("model artifact missing weights")
	}
	return LogisticModel{
		Weights:   tmp.Weights,
		Bias:      tmp.Bias,
		Version:   tmp.Version,
		Threshold: tmp.Threshold,
	}, nil
}

// ShadowScorer evaluates logistic regression scores in shadow mode and persists outcomes.
type ShadowScorer struct {
	model LogisticModel
	sink  ShadowSink
	mu    sync.RWMutex
}

// NewShadowScorer builds a scorer using the provided artifact path and sink.
func NewShadowScorer(modelPath string, sink ShadowSink) (*ShadowScorer, error) {
	model, err := LoadLogisticModel(modelPath)
	if err != nil {
		return nil, err
	}
	return &ShadowScorer{model: model, sink: sink}, nil
}

// Reload refreshes the in-memory model weights from disk.
func (s *ShadowScorer) Reload(modelPath string) error {
	model, err := LoadLogisticModel(modelPath)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.model = model
	s.mu.Unlock()
	return nil
}

// Score computes a probability and emits a shadow scoring record.
func (s *ShadowScorer) Score(ctx context.Context, features map[string]float64, meta ShadowScoreMetadata) (float64, error) {
	s.mu.RLock()
	model := s.model
	s.mu.RUnlock()

	start := time.Now()
	score := logistic(model, features)
	latency := time.Since(start).Seconds() * 1000.0

	event := ShadowScoreEvent{
		RequestID:    meta.RequestID,
		PlacementID:  meta.PlacementID,
		PartnerID:    meta.PartnerID,
		Score:        score,
		Threshold:    model.Threshold,
		Decision:     "shadow",
		WeakLabel:    meta.WeakLabel,
		ModelVersion: model.Version,
		GeneratedAt:  meta.GeneratedAt,
		LatencyMS:    latency,
	}
	if event.RequestID == "" {
		event.RequestID = uuid.NewString()
	}
	if event.GeneratedAt.IsZero() {
		event.GeneratedAt = time.Now().UTC()
	}

	if err := s.sink.Write(ctx, event); err != nil {
		return score, err
	}

	return score, nil
}
