package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/redis/go-redis/v9"
	log "github.com/sirupsen/logrus"

	"fraud/internal/api"
	fraud "fraud/internal/detector"
	"fraud/internal/ml"
	"fraud/internal/reporting"
)

func main() {
	// Setup logging
	log.SetFormatter(&log.JSONFormatter{})
	log.SetLevel(log.InfoLevel)

	// Connect to Redis
	redisClient := redis.NewClient(&redis.Options{
		Addr:     getEnv("REDIS_ADDR", "localhost:6379"),
		Password: getEnv("REDIS_PASSWORD", ""),
		DB:       0,
	})

	ctx := context.Background()
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.WithError(err).Fatal("Failed to connect to Redis")
	}
	log.Info("Connected to Redis")

	// Initialize fraud detector
	fraudDetector := fraud.NewFraudDetector(redisClient)

	// Initialize ML detector
	mlDetector := ml.NewMLFraudDetector(redisClient)

	// Initialize fraud reporting
	webhookClient := reporting.NewHTTPWebhookClient(10 * time.Second)
	fraudReporter := reporting.NewFraudReporter(redisClient, webhookClient)
	fraudAnalytics := reporting.NewFraudAnalytics(redisClient)

	// Setup HTTP server
	router := mux.NewRouter()

	// Register reporting routes
	reportingHandler := api.NewFraudReportingHandler(fraudReporter, fraudAnalytics)
	reportingHandler.RegisterRoutes(router)

	// Health check
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
	}).Methods("GET")

	// Check request for fraud (GIVT/SIVT)
	router.HandleFunc("/v1/fraud/check", func(w http.ResponseWriter, r *http.Request) {
		var req fraud.RequestData
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		result := fraudDetector.CheckRequest(r.Context(), req)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"is_fraud":     result.Blocked,
			"score":        result.Score,
			"reasons":      result.Reasons,
			"fraud_type":   result.FraudType,
			"should_block": result.Blocked,
		})
	}).Methods("POST")

	// ML-based fraud prediction
	router.HandleFunc("/v1/fraud/predict", func(w http.ResponseWriter, r *http.Request) {
		var req fraud.RequestData
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Extract features from request
		features := mlDetector.ExtractFeatures(r.Context(), req.DeviceID, req.IP, req.UserAgent)
		score := mlDetector.Predict(r.Context(), features)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"score":    score,
			"is_fraud": score >= 0.7,
		})
	}).Methods("POST")

	// Get fraud statistics
	router.HandleFunc("/v1/fraud/stats/{publisher_id}", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		publisherID := vars["publisher_id"]

		stats := fraudDetector.GetPublisherStats(r.Context(), publisherID)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(stats)
	}).Methods("GET")

	// Block IP/device
	router.HandleFunc("/v1/fraud/block", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Type  string `json:"type"` // "ip" or "device"
			Value string `json:"value"`
			TTL   int    `json:"ttl"` // Duration in seconds
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		duration := time.Duration(req.TTL) * time.Second
		if duration == 0 {
			duration = 24 * time.Hour // Default 24h block
		}

		if req.Type == "ip" {
			fraudDetector.BlockList.BlockIP(r.Context(), req.Value, duration)
		} else if req.Type == "device" {
			fraudDetector.BlockList.BlockDevice(r.Context(), req.Value, duration)
		} else {
			http.Error(w, "Invalid block type", http.StatusBadRequest)
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"status": "blocked"})
	}).Methods("POST")

	// Unblock IP/device
	router.HandleFunc("/v1/fraud/unblock", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Type  string `json:"type"` // "ip" or "device"
			Value string `json:"value"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if req.Type == "ip" {
			fraudDetector.BlockList.UnblockIP(r.Context(), req.Value)
		} else if req.Type == "device" {
			fraudDetector.BlockList.UnblockDevice(r.Context(), req.Value)
		} else {
			http.Error(w, "Invalid block type", http.StatusBadRequest)
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"status": "unblocked"})
	}).Methods("POST")

	// Train ML model (admin endpoint)
	router.HandleFunc("/v1/fraud/train", func(w http.ResponseWriter, r *http.Request) {
		// This would trigger ML model training
		// For now, just acknowledge

		log.Info("ML model training triggered")

		json.NewEncoder(w).Encode(map[string]string{
			"status":  "training_started",
			"message": "ML model training initiated",
		})
	}).Methods("POST")

	// Get block list
	router.HandleFunc("/v1/fraud/blocklist", func(w http.ResponseWriter, r *http.Request) {
		blockType := r.URL.Query().Get("type")

		var items []string
		var err error

		if blockType == "ip" {
			items, err = fraudDetector.BlockList.GetBlockedIPs(r.Context())
		} else if blockType == "device" {
			items, err = fraudDetector.BlockList.GetBlockedDevices(r.Context())
		} else {
			http.Error(w, "Invalid type parameter", http.StatusBadRequest)
			return
		}

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"type":  blockType,
			"items": items,
			"count": len(items),
		})
	}).Methods("GET")

	// Start server
	port := getEnv("PORT", "8084")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan

		log.Info("Shutting down fraud detection service...")

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			log.WithError(err).Error("Server shutdown failed")
		}
	}()

	log.WithField("port", port).Info("Fraud detection service started")
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.WithError(err).Fatal("Server failed")
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
