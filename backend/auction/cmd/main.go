package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/redis/go-redis/v9"
	log "github.com/sirupsen/logrus"

	"github.com/rivalapexmediation/auction/internal/api"
	"github.com/rivalapexmediation/auction/internal/bidding"
	"github.com/rivalapexmediation/auction/internal/bidders"
	"github.com/rivalapexmediation/auction/internal/waterfall"
)

func main() {
	// Configure logging
	log.SetFormatter(&log.JSONFormatter{})
	log.SetLevel(log.InfoLevel)

	// Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr:     getEnv("REDIS_ADDR", "localhost:6379"),
		Password: getEnv("REDIS_PASSWORD", ""),
		DB:       0,
	})

	ctx := context.Background()
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}

 // Initialize auction components
	auctionEngine := bidding.NewAuctionEngine(redisClient)
	// Feature flags for hedging (off by default)
	if v := getEnv("AUCTION_HEDGING_ENABLED", "false"); v == "true" || v == "1" || v == "TRUE" {
		auctionEngine.SetHedgingEnabled(true)
	}
	if ms := getEnv("AUCTION_HEDGE_DELAY_MS", ""); ms != "" {
		if dms, err := strconv.Atoi(ms); err == nil && dms > 0 {
			auctionEngine.SetHedgeDelay(time.Duration(dms) * time.Millisecond)
		}
	}
	waterfallManager := waterfall.NewWaterfallManager(redisClient)

	// Wire a default in-memory Mediation Debugger (bounded capacity)
	bidders.SetDebugger(bidders.NewInMemoryDebugger(200))
	// Wire a default in-process metrics recorder with rolling percentiles (dev-friendly)
	bidders.SetMetricsRecorder(bidders.NewRollingMetricsRecorder(512))
	// Wire a default time-series aggregator for 7-day dashboards (5-min buckets)
	bidders.SetTimeSeriesAggregator(bidders.NewTimeSeriesAggregator(5*time.Minute, 7*24*time.Hour))

	// Initialize HTTP handlers
	handlers := api.NewHandlers(auctionEngine, waterfallManager)

	// Setup router
	router := mux.NewRouter()
	// CORS middleware for website access
	router.Use(corsMiddleware)

	router.HandleFunc("/health", handlers.HealthCheck).Methods("GET")
	router.HandleFunc("/v1/auction", handlers.RunAuction).Methods("POST")
	router.HandleFunc("/v1/bids", handlers.ReceiveBid).Methods("POST")
	router.HandleFunc("/v1/waterfall/{placement}", handlers.GetWaterfall).Methods("GET")
	// Mediation Debugger (read-only)
	router.HandleFunc("/v1/debug/mediation", handlers.GetMediationDebugEvents).Methods("GET", "OPTIONS")
	// Adapter metrics snapshot (read-only)
	router.HandleFunc("/v1/metrics/adapters", handlers.GetAdapterMetrics).Methods("GET", "OPTIONS")
	// Time-series metrics (7 days, 5-min buckets)
	router.HandleFunc("/v1/metrics/adapters/timeseries", handlers.GetAdapterMetricsTimeSeries).Methods("GET", "OPTIONS")
	// SLO status
	router.HandleFunc("/v1/metrics/slo", handlers.GetAdapterSLO).Methods("GET", "OPTIONS")

	// HTTP server
	srv := &http.Server{
		Addr:         ":" + getEnv("PORT", "8081"),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server
	go func() {
		log.Infof("Starting auction service on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Info("Server exited")
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := getEnv("CORS_ORIGIN", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
