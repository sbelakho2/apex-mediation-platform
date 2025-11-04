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

	"router/internal/geo"
	"router/internal/ratelimit"
	"router/internal/selector"
	"router/internal/validation"
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

	// Initialize components
	geoRouter, err := geo.NewGeoRouter(getEnv("GEOIP_DB_PATH", ""))
	if err != nil {
		log.WithError(err).Warn("GeoIP not available, using defaults")
	}
	defer geoRouter.Close()

	rateLimiter := ratelimit.NewTokenBucket(redisClient)
	adapterSelector := selector.NewAdapterSelector(redisClient)
	validator := validation.NewValidator()

	// Setup HTTP server
	router := mux.NewRouter()

	// Health check
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
	}).Methods("GET")

	// Route ad request
	router.HandleFunc("/v1/route", func(w http.ResponseWriter, r *http.Request) {
		var req validation.AdRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Validate request
		validationErrors := validator.ValidateRequest(&req)
		if len(validationErrors) > 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":  "validation_failed",
				"errors": validationErrors,
			})
			return
		}

		// Check rate limits
		allowed, err := rateLimiter.AllowPublisher(r.Context(), req.PublisherID, 1000, time.Minute)
		if err != nil {
			http.Error(w, "Rate limit check failed", http.StatusInternalServerError)
			return
		}
		if !allowed {
			http.Error(w, "Rate limit exceeded", http.StatusTooManyRequests)
			return
		}

		// Get geographic region
		region := geoRouter.GetRegion(r.Context(), req.IP)

		// Select adapters
		adapters, err := adapterSelector.SelectAdapters(r.Context(), region, req.AdFormat, 5)
		if err != nil {
			http.Error(w, "Failed to select adapters", http.StatusInternalServerError)
			return
		}

		// Check if high-value geo
		highValue := geoRouter.IsHighValueGeo(r.Context(), req.IP)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"adapters":   adapters,
			"region":     region,
			"high_value": highValue,
		})
	}).Methods("POST")

	// Get adapter info
	router.HandleFunc("/v1/adapters/{adapter_id}", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		adapterID := vars["adapter_id"]

		adapter, err := adapterSelector.GetAdapter(r.Context(), adapterID)
		if err != nil {
			http.Error(w, "Adapter not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(adapter)
	}).Methods("GET")

	// List all adapters
	router.HandleFunc("/v1/adapters", func(w http.ResponseWriter, r *http.Request) {
		region := r.URL.Query().Get("region")
		if region == "" {
			region = "us-east"
		}

		adapters, err := adapterSelector.SelectAdapters(r.Context(), region, "banner", 100)
		if err != nil {
			http.Error(w, "Failed to list adapters", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"adapters": adapters,
			"count":    len(adapters),
		})
	}).Methods("GET")

	// Record adapter response (for health monitoring)
	router.HandleFunc("/v1/adapters/{adapter_id}/response", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		adapterID := vars["adapter_id"]

		var req struct {
			Success   bool  `json:"success"`
			LatencyMs int64 `json:"latency_ms"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		adapterSelector.RecordAdapterResponse(r.Context(), adapterID, req.Success, req.LatencyMs)

		w.WriteHeader(http.StatusNoContent)
	}).Methods("POST")

	// Get geo location
	router.HandleFunc("/v1/geo/lookup", func(w http.ResponseWriter, r *http.Request) {
		ip := r.URL.Query().Get("ip")
		if ip == "" {
			http.Error(w, "ip parameter required", http.StatusBadRequest)
			return
		}

		location, err := geoRouter.Lookup(r.Context(), ip)
		if err != nil {
			http.Error(w, "Geo lookup failed", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(location)
	}).Methods("GET")

	// Check rate limit status
	router.HandleFunc("/v1/ratelimit/{type}/{id}", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		limitType := vars["type"]
		id := vars["id"]

		var key string
		switch limitType {
		case "publisher":
			key = "ratelimit:publisher:" + id
		case "adapter":
			key = "ratelimit:adapter:" + id
		case "ip":
			key = "ratelimit:ip:" + id
		default:
			http.Error(w, "Invalid type", http.StatusBadRequest)
			return
		}

		count, _ := rateLimiter.GetCurrentCount(r.Context(), key, time.Minute)
		remaining, _ := rateLimiter.GetRemainingQuota(r.Context(), key, 1000, time.Minute)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"current":   count,
			"remaining": remaining,
			"limit":     1000,
			"window":    "1m",
		})
	}).Methods("GET")

	// Start server
	port := getEnv("PORT", "8085")
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

		log.Info("Shutting down router service...")

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			log.WithError(err).Error("Server shutdown failed")
		}
	}()

	log.WithField("port", port).Info("Router service started")
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
