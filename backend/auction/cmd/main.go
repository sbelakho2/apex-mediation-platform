package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/redis/go-redis/v9"
	log "github.com/sirupsen/logrus"

	"github.com/rivalapexmediation/auction/internal/api"
	"github.com/rivalapexmediation/auction/internal/bidding"
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
	waterfallManager := waterfall.NewWaterfallManager(redisClient)

	// Initialize HTTP handlers
	handlers := api.NewHandlers(auctionEngine, waterfallManager)

	// Setup router
	router := mux.NewRouter()
	router.HandleFunc("/health", handlers.HealthCheck).Methods("GET")
	router.HandleFunc("/v1/auction", handlers.RunAuction).Methods("POST")
	router.HandleFunc("/v1/bids", handlers.ReceiveBid).Methods("POST")
	router.HandleFunc("/v1/waterfall/{placement}", handlers.GetWaterfall).Methods("GET")

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

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
