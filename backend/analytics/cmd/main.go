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

	"analytics/internal/clickhouse"
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

	// Connect to ClickHouse
	chClient, err := clickhouse.NewClickHouseClient(getEnv("CLICKHOUSE_ADDR", "localhost:9000"))
	if err != nil {
		log.WithError(err).Fatal("Failed to connect to ClickHouse")
	}
	defer chClient.Close()

	// Setup HTTP server
	router := mux.NewRouter()

	// Health check
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
	}).Methods("GET")

	// Insert impression
	router.HandleFunc("/v1/events/impression", func(w http.ResponseWriter, r *http.Request) {
		var event clickhouse.ImpressionEvent
		if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if err := chClient.InsertImpression(r.Context(), event); err != nil {
			log.WithError(err).Error("Failed to insert impression")
			http.Error(w, "Failed to insert event", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
	}).Methods("POST")

	// Insert click
	router.HandleFunc("/v1/events/click", func(w http.ResponseWriter, r *http.Request) {
		var event clickhouse.ClickEvent
		if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if err := chClient.InsertClick(r.Context(), event); err != nil {
			log.WithError(err).Error("Failed to insert click")
			http.Error(w, "Failed to insert event", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
	}).Methods("POST")

	// Get publisher stats
	router.HandleFunc("/v1/stats/publisher/{publisher_id}", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		publisherID := vars["publisher_id"]

		// Parse date range
		startDate, endDate := parseDateRange(r)

		stats, err := chClient.GetPublisherStats(r.Context(), publisherID, startDate, endDate)
		if err != nil {
			log.WithError(err).Error("Failed to get publisher stats")
			http.Error(w, "Failed to get stats", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(stats)
	}).Methods("GET")

	// Get revenue by date
	router.HandleFunc("/v1/stats/publisher/{publisher_id}/revenue", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		publisherID := vars["publisher_id"]

		startDate, endDate := parseDateRange(r)

		revenue, err := chClient.GetRevenueByDate(r.Context(), publisherID, startDate, endDate)
		if err != nil {
			log.WithError(err).Error("Failed to get revenue by date")
			http.Error(w, "Failed to get revenue", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": revenue,
		})
	}).Methods("GET")

	// Get top placements
	router.HandleFunc("/v1/stats/publisher/{publisher_id}/placements", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		publisherID := vars["publisher_id"]

		startDate, endDate := parseDateRange(r)

		placements, err := chClient.GetTopPerformingPlacements(r.Context(), publisherID, 10, startDate, endDate)
		if err != nil {
			log.WithError(err).Error("Failed to get top placements")
			http.Error(w, "Failed to get placements", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": placements,
		})
	}).Methods("GET")

	// Get adapter performance
	router.HandleFunc("/v1/stats/adapters", func(w http.ResponseWriter, r *http.Request) {
		startDate, endDate := parseDateRange(r)

		adapters, err := chClient.GetAdapterPerformance(r.Context(), startDate, endDate)
		if err != nil {
			log.WithError(err).Error("Failed to get adapter performance")
			http.Error(w, "Failed to get adapter performance", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": adapters,
		})
	}).Methods("GET")

	// Start server
	port := getEnv("PORT", "8086")
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

		log.Info("Shutting down analytics service...")

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			log.WithError(err).Error("Server shutdown failed")
		}
	}()

	log.WithField("port", port).Info("Analytics service started")
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

func parseDateRange(r *http.Request) (time.Time, time.Time) {
	// Default to last 7 days
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -7)

	if start := r.URL.Query().Get("start_date"); start != "" {
		if t, err := time.Parse("2006-01-02", start); err == nil {
			startDate = t
		}
	}

	if end := r.URL.Query().Get("end_date"); end != "" {
		if t, err := time.Parse("2006-01-02", end); err == nil {
			endDate = t
		}
	}

	return startDate, endDate
}
