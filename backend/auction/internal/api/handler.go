package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	log "github.com/sirupsen/logrus"

	"github.com/rivalapexmediation/auction/internal/bidding"
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
