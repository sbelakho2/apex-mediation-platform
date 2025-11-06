package bidders

// Minimal, pluggable metrics scaffolding for adapters (no external deps)
// Default implementation is no-op; can be replaced in main() or tests.

// MetricsRecorder records adapter-level metrics. Implementations should be cheap and non-blocking.
type MetricsRecorder interface {
    IncRequest(adapter string)
    IncSuccess(adapter string)
    IncError(adapter, reason string)
    IncNoFill(adapter string)
    IncTimeout(adapter string)
    ObserveLatencyMS(adapter string, ms float64)
}

// noopMetrics implements MetricsRecorder as no-ops.
type noopMetrics struct{}

func (n noopMetrics) IncRequest(adapter string)                 {}
func (n noopMetrics) IncSuccess(adapter string)                 {}
func (n noopMetrics) IncError(adapter, reason string)           {}
func (n noopMetrics) IncNoFill(adapter string)                  {}
func (n noopMetrics) IncTimeout(adapter string)                 {}
func (n noopMetrics) ObserveLatencyMS(adapter string, ms float64) {}

var metricsRecorder MetricsRecorder = noopMetrics{}

// SetMetricsRecorder allows wiring a custom recorder from outside this package.
func SetMetricsRecorder(r MetricsRecorder) { if r != nil { metricsRecorder = r } }

// Helper wrappers to guard against nil and keep call-sites terse
func recordRequest(adapter string) {
    metricsRecorder.IncRequest(adapter)
    if globalTS != nil { globalTS.IncRequest(adapter) }
}
func recordSuccess(adapter string) {
    metricsRecorder.IncSuccess(adapter)
    if globalTS != nil { globalTS.IncSuccess(adapter) }
}
func recordError(adapter, reason string) {
    metricsRecorder.IncError(adapter, reason)
    if globalTS != nil { globalTS.IncError(adapter, reason) }
}
func recordNoFill(adapter string) {
    metricsRecorder.IncNoFill(adapter)
    if globalTS != nil { globalTS.IncNoFill(adapter) }
}
func recordTimeout(adapter string) {
    metricsRecorder.IncTimeout(adapter)
    if globalTS != nil { globalTS.IncTimeout(adapter) }
}
func observeLatency(adapter string, ms float64) {
    metricsRecorder.ObserveLatencyMS(adapter, ms)
    if globalTS != nil { globalTS.ObserveLatencyMS(adapter, ms) }
}
