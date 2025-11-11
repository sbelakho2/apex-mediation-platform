package bidders

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// PrometheusMetricsHandler exposes a lightweight Prometheus text exposition of adapter metrics.
// It does not require any external dependency. When invoked, it computes a snapshot over a
// configurable window (default 1h) from the in-memory TimeSeriesAggregator and emits counters
// and gauges using Prometheus text format.
//
// Supported query params:
//   - window: Go duration (e.g., 5m, 1h, 24h). Defaults to 1h.
//
// Exported metrics (per adapter):
//   - auction_adapter_requests_total{adapter}
//   - auction_adapter_success_total{adapter}
//   - auction_adapter_nofill_total{adapter}
//   - auction_adapter_timeout_total{adapter}
//   - auction_adapter_errors_total{adapter}
//   - auction_adapter_errors_total{adapter,reason}
//   - auction_adapter_latency_p95_ms{adapter}
//   - auction_adapter_latency_p99_ms{adapter}
func PrometheusMetricsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")

		// Determine window
		winStr := r.URL.Query().Get("window")
		if winStr == "" {
			winStr = "1h"
		}
		window, err := time.ParseDuration(winStr)
		if err != nil || window <= 0 {
			window = time.Hour
		}

		// Use time-series snapshots to compute totals and error reasons per adapter
		snaps := GetTimeSeriesSnapshot(window)
		aggs := GetWindowAggregates(window)

		// Build a quick lookup for aggregates by adapter
		aggByAdapter := map[string]WindowAggregate{}
		for _, a := range aggs {
			aggByAdapter[a.Adapter] = a
		}

		var b strings.Builder
		// Metric headers (TYPE help is optional but useful)
		b.WriteString("# HELP auction_adapter_requests_total Total adapter requests in window\n")
		b.WriteString("# TYPE auction_adapter_requests_total counter\n")
		b.WriteString("# HELP auction_adapter_success_total Successful bids in window\n")
		b.WriteString("# TYPE auction_adapter_success_total counter\n")
		b.WriteString("# HELP auction_adapter_nofill_total No-fill outcomes in window\n")
		b.WriteString("# TYPE auction_adapter_nofill_total counter\n")
		b.WriteString("# HELP auction_adapter_timeout_total Timeouts in window\n")
		b.WriteString("# TYPE auction_adapter_timeout_total counter\n")
		b.WriteString("# HELP auction_adapter_errors_total Error outcomes in window (optionally labeled by reason)\n")
		b.WriteString("# TYPE auction_adapter_errors_total counter\n")
		b.WriteString("# HELP auction_adapter_latency_p95_ms Estimated p95 latency (ms) over merged histogram in window\n")
		b.WriteString("# TYPE auction_adapter_latency_p95_ms gauge\n")
		b.WriteString("# HELP auction_adapter_latency_p99_ms Estimated p99 latency (ms) over merged histogram in window\n")
		b.WriteString("# TYPE auction_adapter_latency_p99_ms gauge\n")

		for _, snap := range snaps {
			adapter := snap.Adapter
			agg := aggByAdapter[adapter]

			// Counters
			b.WriteString(fmt.Sprintf("auction_adapter_requests_total{adapter=%q} %d\n", adapter, agg.Requests))
			b.WriteString(fmt.Sprintf("auction_adapter_success_total{adapter=%q} %d\n", adapter, agg.Success))
			b.WriteString(fmt.Sprintf("auction_adapter_nofill_total{adapter=%q} %d\n", adapter, agg.NoFill))
			b.WriteString(fmt.Sprintf("auction_adapter_timeout_total{adapter=%q} %d\n", adapter, agg.Timeout))
			b.WriteString(fmt.Sprintf("auction_adapter_errors_total{adapter=%q} %d\n", adapter, agg.Errors))

			// Error reasons: sum across buckets' Errors maps
			reasons := map[string]int{}
			for _, bucket := range snap.Buckets {
				for reason, c := range bucket.Errors {
					reasons[reason] += c
				}
			}
			for reason, c := range reasons {
				// Basic label sanitization: ensure reason is a bare string
				b.WriteString(fmt.Sprintf("auction_adapter_errors_total{adapter=%q,reason=%q} %d\n", adapter, reason, c))
			}

			// Percentiles: merge histogram bins across buckets to estimate p95 and p99
			var merged TimeSeriesBucket
			for _, bucket := range snap.Buckets {
				for i := 0; i < len(merged.LatBins); i++ {
					merged.LatBins[i] += bucket.LatBins[i]
				}
			}
			p95 := estimatePercentile(&merged, 0.95)
			p99 := estimatePercentile(&merged, 0.99)
			// Emit as gauges
			b.WriteString(fmt.Sprintf("auction_adapter_latency_p95_ms{adapter=%q} %s\n", adapter, formatFloat(p95)))
			b.WriteString(fmt.Sprintf("auction_adapter_latency_p99_ms{adapter=%q} %s\n", adapter, formatFloat(p99)))
		}

		_, _ = w.Write([]byte(b.String()))
	}
}

func formatFloat(f float64) string {
	// Prometheus text exposition prefers plain or scientific; strconv.FormatFloat is fine.
	return strconv.FormatFloat(f, 'f', -1, 64)
}
