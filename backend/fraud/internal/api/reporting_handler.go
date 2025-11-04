package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"fraud/internal/reporting"

	"github.com/gorilla/mux"
)

// FraudReportingHandler handles fraud reporting API endpoints
type FraudReportingHandler struct {
	reporter  *reporting.FraudReporter
	analytics *reporting.FraudAnalytics
}

// NewFraudReportingHandler creates a new fraud reporting handler
func NewFraudReportingHandler(reporter *reporting.FraudReporter, analytics *reporting.FraudAnalytics) *FraudReportingHandler {
	return &FraudReportingHandler{
		reporter:  reporter,
		analytics: analytics,
	}
}

// RegisterRoutes registers fraud reporting routes
func (h *FraudReportingHandler) RegisterRoutes(router *mux.Router) {
	// Alert endpoints
	router.HandleFunc("/v1/fraud/alerts", h.PublishAlert).Methods("POST")
	router.HandleFunc("/v1/fraud/alerts/{publisher_id}", h.GetAlerts).Methods("GET")

	// Blocking endpoints
	router.HandleFunc("/v1/fraud/block", h.BlockEntity).Methods("POST")
	router.HandleFunc("/v1/fraud/unblock", h.UnblockEntity).Methods("POST")
	router.HandleFunc("/v1/fraud/blocks/{entity_type}", h.GetBlocks).Methods("GET")
	router.HandleFunc("/v1/fraud/check-blocked", h.CheckBlocked).Methods("GET")

	// Statistics endpoints
	router.HandleFunc("/v1/fraud/stats/{publisher_id}", h.GetStats).Methods("GET")
	router.HandleFunc("/v1/fraud/dashboard/{publisher_id}", h.GetDashboard).Methods("GET")

	// Analytics endpoints
	router.HandleFunc("/v1/fraud/trend/{publisher_id}", h.GetTrend).Methods("GET")
	router.HandleFunc("/v1/fraud/top-fraudsters", h.GetTopFrausters).Methods("GET")
	router.HandleFunc("/v1/fraud/patterns/{publisher_id}", h.GetPatterns).Methods("GET")

	// Webhook endpoints
	router.HandleFunc("/v1/fraud/webhooks", h.CreateWebhook).Methods("POST")
	router.HandleFunc("/v1/fraud/webhooks/{webhook_id}", h.GetWebhook).Methods("GET")
	router.HandleFunc("/v1/fraud/webhooks/{webhook_id}", h.UpdateWebhook).Methods("PUT")
	router.HandleFunc("/v1/fraud/webhooks/{webhook_id}", h.DeleteWebhook).Methods("DELETE")
}

// PublishAlert handles POST /v1/fraud/alerts
func (h *FraudReportingHandler) PublishAlert(w http.ResponseWriter, r *http.Request) {
	var alert reporting.FraudAlert
	if err := json.NewDecoder(r.Body).Decode(&alert); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}

	if err := h.reporter.PublishAlert(r.Context(), alert); err != nil {
		http.Error(w, fmt.Sprintf("Failed to publish alert: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "success",
		"alert_id": alert.ID,
	})
}

// GetAlerts handles GET /v1/fraud/alerts/{publisher_id}
func (h *FraudReportingHandler) GetAlerts(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	publisherID := vars["publisher_id"]

	limitStr := r.URL.Query().Get("limit")
	limit := int64(50)
	if limitStr != "" {
		if l, err := strconv.ParseInt(limitStr, 10, 64); err == nil {
			limit = l
		}
	}

	alerts, err := h.reporter.GetRecentAlerts(r.Context(), publisherID, limit)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get alerts: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"publisher_id": publisherID,
		"alerts":       alerts,
		"count":        len(alerts),
	})
}

// BlockEntity handles POST /v1/fraud/block
func (h *FraudReportingHandler) BlockEntity(w http.ResponseWriter, r *http.Request) {
	var entity reporting.BlockedEntity
	if err := json.NewDecoder(r.Body).Decode(&entity); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}

	if err := h.reporter.BlockEntity(r.Context(), entity); err != nil {
		http.Error(w, fmt.Sprintf("Failed to block entity: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "success",
		"entity_type": entity.EntityType,
		"entity_id":   entity.EntityID,
		"blocked_at":  entity.BlockedAt,
	})
}

// UnblockEntity handles POST /v1/fraud/unblock
func (h *FraudReportingHandler) UnblockEntity(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EntityType string `json:"entity_type"`
		EntityID   string `json:"entity_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}

	if err := h.reporter.UnblockEntity(r.Context(), req.EntityType, req.EntityID); err != nil {
		http.Error(w, fmt.Sprintf("Failed to unblock entity: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "success",
		"entity_type": req.EntityType,
		"entity_id":   req.EntityID,
	})
}

// GetBlocks handles GET /v1/fraud/blocks/{entity_type}
func (h *FraudReportingHandler) GetBlocks(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	entityType := vars["entity_type"]

	limitStr := r.URL.Query().Get("limit")
	limit := int64(100)
	if limitStr != "" {
		if l, err := strconv.ParseInt(limitStr, 10, 64); err == nil {
			limit = l
		}
	}

	entities, err := h.reporter.GetBlockedEntities(r.Context(), entityType, limit)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get blocks: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"entity_type": entityType,
		"entities":    entities,
		"count":       len(entities),
	})
}

// CheckBlocked handles GET /v1/fraud/check-blocked
func (h *FraudReportingHandler) CheckBlocked(w http.ResponseWriter, r *http.Request) {
	entityType := r.URL.Query().Get("entity_type")
	entityID := r.URL.Query().Get("entity_id")

	if entityType == "" || entityID == "" {
		http.Error(w, "Missing entity_type or entity_id parameter", http.StatusBadRequest)
		return
	}

	isBlocked, entity, err := h.reporter.IsBlocked(r.Context(), entityType, entityID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to check block: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"entity_type": entityType,
		"entity_id":   entityID,
		"is_blocked":  isBlocked,
		"entity":      entity,
	})
}

// GetStats handles GET /v1/fraud/stats/{publisher_id}
func (h *FraudReportingHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	publisherID := vars["publisher_id"]

	timeWindow := r.URL.Query().Get("window")
	if timeWindow == "" {
		timeWindow = "24h"
	}

	stats, err := h.reporter.GetFraudStats(r.Context(), publisherID, timeWindow)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get stats: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// GetDashboard handles GET /v1/fraud/dashboard/{publisher_id}
func (h *FraudReportingHandler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	publisherID := vars["publisher_id"]

	dashboard, err := h.analytics.GetDashboardData(r.Context(), publisherID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get dashboard: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboard)
}

// GetTrend handles GET /v1/fraud/trend/{publisher_id}
func (h *FraudReportingHandler) GetTrend(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	publisherID := vars["publisher_id"]

	// Parse query parameters
	startTimeStr := r.URL.Query().Get("start")
	endTimeStr := r.URL.Query().Get("end")
	granularity := r.URL.Query().Get("granularity")

	if granularity == "" {
		granularity = "hourly"
	}

	var startTime, endTime time.Time
	var err error

	if startTimeStr == "" {
		startTime = time.Now().Add(-24 * time.Hour)
	} else {
		startTime, err = time.Parse(time.RFC3339, startTimeStr)
		if err != nil {
			http.Error(w, "Invalid start time format", http.StatusBadRequest)
			return
		}
	}

	if endTimeStr == "" {
		endTime = time.Now()
	} else {
		endTime, err = time.Parse(time.RFC3339, endTimeStr)
		if err != nil {
			http.Error(w, "Invalid end time format", http.StatusBadRequest)
			return
		}
	}

	trend, err := h.analytics.GetFraudTrend(r.Context(), publisherID, startTime, endTime, granularity)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get trend: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(trend)
}

// GetTopFrausters handles GET /v1/fraud/top-fraudsters
func (h *FraudReportingHandler) GetTopFrausters(w http.ResponseWriter, r *http.Request) {
	entityType := r.URL.Query().Get("entity_type")
	if entityType == "" {
		entityType = "publisher"
	}

	timeWindow := r.URL.Query().Get("window")
	if timeWindow == "" {
		timeWindow = "24h"
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 10
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	topFrausters, err := h.analytics.GetTopFrausters(r.Context(), entityType, timeWindow, limit)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get top fraudsters: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(topFrausters)
}

// GetPatterns handles GET /v1/fraud/patterns/{publisher_id}
func (h *FraudReportingHandler) GetPatterns(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	publisherID := vars["publisher_id"]

	patterns, err := h.analytics.DetectFraudPattern(r.Context(), publisherID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to detect patterns: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"publisher_id": publisherID,
		"patterns":     patterns,
		"count":        len(patterns),
	})
}

// CreateWebhook handles POST /v1/fraud/webhooks
func (h *FraudReportingHandler) CreateWebhook(w http.ResponseWriter, r *http.Request) {
	var webhook reporting.WebhookConfig
	if err := json.NewDecoder(r.Body).Decode(&webhook); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}

	// Generate webhook ID
	webhook.ID = fmt.Sprintf("webhook_%d", time.Now().UnixNano())
	webhook.CreatedAt = time.Now()

	// TODO: Store webhook in Redis
	// This would be implemented in the reporter

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(webhook)
}

// GetWebhook handles GET /v1/fraud/webhooks/{webhook_id}
func (h *FraudReportingHandler) GetWebhook(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	webhookID := vars["webhook_id"]

	// TODO: Retrieve webhook from Redis

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"webhook_id": webhookID,
		"status":     "not_implemented",
	})
}

// UpdateWebhook handles PUT /v1/fraud/webhooks/{webhook_id}
func (h *FraudReportingHandler) UpdateWebhook(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	webhookID := vars["webhook_id"]

	var webhook reporting.WebhookConfig
	if err := json.NewDecoder(r.Body).Decode(&webhook); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}

	webhook.ID = webhookID

	// TODO: Update webhook in Redis

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(webhook)
}

// DeleteWebhook handles DELETE /v1/fraud/webhooks/{webhook_id}
func (h *FraudReportingHandler) DeleteWebhook(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	webhookID := vars["webhook_id"]

	// TODO: Delete webhook from Redis

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "success",
		"webhook_id": webhookID,
	})
}
