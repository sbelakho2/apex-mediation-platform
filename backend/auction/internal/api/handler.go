package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	log "github.com/sirupsen/logrus"

	"github.com/rivalapexmediation/auction/internal/bidding"
	"github.com/rivalapexmediation/auction/internal/bidders"
	"github.com/rivalapexmediation/auction/internal/waterfall"
)

// Handlers contains HTTP handlers
type Handlers struct {
	auctionEngine    *bidding.AuctionEngine
	waterfallManager *waterfall.WaterfallManager
}

// NewHandlers creates new HTTP handlers
func NewHandlers(ae *bidding.AuctionEngine, wm *waterfall.WaterfallManager) *Handlers {
	return &Handlers{
		auctionEngine:    ae,
		waterfallManager: wm,
	}
}

// HealthCheck returns service health
func (h *Handlers) HealthCheck(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]string{
		"status":  "healthy",
		"service": "auction",
	})
}

// RunAuction handles auction requests
func (h *Handlers) RunAuction(w http.ResponseWriter, r *http.Request) {
	var req bidding.BidRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	// Validate request
	if req.RequestID == "" || req.PlacementID == "" {
		respondError(w, http.StatusBadRequest, "Missing required fields")
		return
	}

	// Run auction
	result, err := h.auctionEngine.RunAuction(r.Context(), req)
	if err != nil {
		log.WithError(err).Error("Auction failed")
		respondError(w, http.StatusInternalServerError, "Auction failed")
		return
	}

	respondJSON(w, http.StatusOK, result)
}

// ReceiveBid handles S2S bid responses
func (h *Handlers) ReceiveBid(w http.ResponseWriter, r *http.Request) {
	var bid bidding.BidResponse

	if err := json.NewDecoder(r.Body).Decode(&bid); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid bid")
		return
	}

	// Process bid (store in Redis, etc.)
	// This would be handled by a bid queue in production

	respondJSON(w, http.StatusOK, map[string]string{
		"status": "received",
		"bid_id": bid.BidID,
	})
}

// GetWaterfall returns waterfall configuration
func (h *Handlers) GetWaterfall(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	placementID := vars["placement"]

	config, err := h.waterfallManager.GetWaterfall(r.Context(), placementID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch waterfall")
		return
	}

	respondJSON(w, http.StatusOK, config)
}

// GetMediationDebugEvents returns last-N mediation debugger events (sanitized) for a placement.
// Query params:
//   placement_id: string (optional; empty returns events stored under unknown bucket)
//   n: int (optional; default 50, max 200)
func (h *Handlers) GetMediationDebugEvents(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	placementID := q.Get("placement_id")
	n := 50
	if ns := q.Get("n"); ns != "" {
		if v, err := strconv.Atoi(ns); err == nil && v > 0 {
			if v > 200 { v = 200 }
			n = v
		}
	}
	events := bidders.GetLastDebugEvents(placementID, n)
	respondJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"data":    events,
	})
}

// GetAdapterMetrics returns a read-only snapshot of per-adapter metrics (requests, outcomes, percentiles).
// Route: GET /v1/metrics/adapters
func (h *Handlers) GetAdapterMetrics(w http.ResponseWriter, r *http.Request) {
	snaps := bidders.GetAdapterMetricsSnapshot()
	respondJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"data":    snaps,
	})
}

// GetAdapterMetricsTimeSeries returns 7-day time-series buckets (5-min) per adapter.
// Route: GET /v1/metrics/adapters/timeseries?days=7
func (h *Handlers) GetAdapterMetricsTimeSeries(w http.ResponseWriter, r *http.Request) {
	days := 7
	if s := r.URL.Query().Get("days"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v > 0 && v <= 14 { days = v }
	}
	maxAge := time.Duration(days) * 24 * time.Hour
	snaps := bidders.GetTimeSeriesSnapshot(maxAge)
	respondJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"data":    snaps,
	})
}

// GetAdapterSLO returns current SLO status per adapter for 1h and 24h windows.
// Route: GET /v1/metrics/slo
func (h *Handlers) GetAdapterSLO(w http.ResponseWriter, r *http.Request) {
	status1h := bidders.EvaluateSLO(1 * time.Hour)
	status24h := bidders.EvaluateSLO(24 * time.Hour)
	respondJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"data": map[string]any{
			"window_1h":  status1h,
			"window_24h": status24h,
		},
	})
}

// GetObservabilitySnapshot aggregates SLO status with optional last-N debugger events for a placement.
// Route: GET /v1/metrics/overview?placement_id=&n=
func (h *Handlers) GetObservabilitySnapshot(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	placementID := q.Get("placement_id")
	n := 50
	if ns := q.Get("n"); ns != "" {
		if v, err := strconv.Atoi(ns); err == nil && v > 0 {
			if v > 200 {
				v = 200
			}
			n = v
		}
	}
	status1h := bidders.EvaluateSLO(1 * time.Hour)
	status24h := bidders.EvaluateSLO(24 * time.Hour)
	var events []bidders.DebugEvent
	if placementID != "" {
		events = bidders.GetLastDebugEvents(placementID, n)
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"data": map[string]any{
			"slo": map[string]any{
				"window_1h":  status1h,
				"window_24h": status24h,
			},
			"debugger": map[string]any{
				"placement_id": placementID,
				"events":       events,
			},
		},
	})
}

// Helper functions

func respondJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, statusCode int, message string) {
	respondJSON(w, statusCode, map[string]string{
		"error": message,
	})
}
