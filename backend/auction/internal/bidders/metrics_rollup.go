package bidders

import (
	"sort"
	"sync"
	"time"
)

// AdapterMetricsSnapshot is a read-only view of adapter metrics for APIs and dashboards.
type AdapterMetricsSnapshot struct {
	Adapter       string             `json:"adapter"`
	Requests      int                `json:"requests"`
	Success       int                `json:"success"`
	NoFill        int                `json:"no_fill"`
	Timeout       int                `json:"timeout"`
	Errors        map[string]int     `json:"errors,omitempty"`
	LatencyP50    float64            `json:"latency_p50_ms"`
	LatencyP95    float64            `json:"latency_p95_ms"`
	LatencyP99    float64            `json:"latency_p99_ms"`
}

// RollingMetricsRecorder is an in-process metrics recorder that keeps a rolling
// window of observations per adapter and computes simple percentiles.
// It implements MetricsRecorder so it can be wired via SetMetricsRecorder in tests or dev.
// Note: This is intentionally lightweight and lock-protected; not for high-QPS prod use.
type RollingMetricsRecorder struct {
	mu sync.Mutex

	// counters
	req     map[string]int
	succ    map[string]int
	err     map[string]map[string]int // adapter -> reason -> count
	noFill  map[string]int
	timeout map[string]int

	// latency observations per adapter (keeps at most windowSize most recent)
	lat   map[string][]float64
	// timestamps for optional aging/TTL trimming later
	latTS map[string][]time.Time

	windowSize int
}

// NewRollingMetricsRecorder creates a recorder with a per-adapter rolling window size.
// If windowSize <= 0, defaults to 512.
func NewRollingMetricsRecorder(windowSize int) *RollingMetricsRecorder {
	if windowSize <= 0 { windowSize = 512 }
	return &RollingMetricsRecorder{
		req:       map[string]int{},
		succ:      map[string]int{},
		err:       map[string]map[string]int{},
		noFill:    map[string]int{},
		timeout:   map[string]int{},
		lat:       map[string][]float64{},
		latTS:     map[string][]time.Time{},
		windowSize: windowSize,
	}
}

// MetricsRecorder implementation
func (r *RollingMetricsRecorder) IncRequest(adapter string)                 { r.inc(&r.req, adapter) }
func (r *RollingMetricsRecorder) IncSuccess(adapter string)                 { r.inc(&r.succ, adapter) }
func (r *RollingMetricsRecorder) IncNoFill(adapter string)                  { r.inc(&r.noFill, adapter) }
func (r *RollingMetricsRecorder) IncTimeout(adapter string)                 { r.inc(&r.timeout, adapter) }
func (r *RollingMetricsRecorder) IncError(adapter, reason string)           { r.incErr(adapter, reason) }
func (r *RollingMetricsRecorder) ObserveLatencyMS(adapter string, ms float64) { r.addLatency(adapter, ms, time.Now()) }

func (r *RollingMetricsRecorder) inc(m *map[string]int, k string) {
	r.mu.Lock(); defer r.mu.Unlock()
	(*m)[k] = (*m)[k] + 1
}

func (r *RollingMetricsRecorder) incErr(adapter, reason string) {
	r.mu.Lock(); defer r.mu.Unlock()
	m, ok := r.err[adapter]
	if !ok { m = map[string]int{}; r.err[adapter] = m }
	m[reason] = m[reason] + 1
}

func (r *RollingMetricsRecorder) addLatency(adapter string, ms float64, ts time.Time) {
	r.mu.Lock(); defer r.mu.Unlock()
	arr := append(r.lat[adapter], ms)
	arrTS := append(r.latTS[adapter], ts)
	if len(arr) > r.windowSize {
		arr = arr[len(arr)-r.windowSize:]
		arrTS = arrTS[len(arrTS)-r.windowSize:]
	}
	r.lat[adapter] = arr
	r.latTS[adapter] = arrTS
}

// Percentiles returns p50/p95/p99 for the adapter based on the current rolling window.
// If no observations exist, all values are 0.
func (r *RollingMetricsRecorder) Percentiles(adapter string) (p50, p95, p99 float64) {
	r.mu.Lock(); defer r.mu.Unlock()
	vals := append([]float64(nil), r.lat[adapter]...)
	if len(vals) == 0 { return 0, 0, 0 }
	sort.Float64s(vals)
	idx := func(p float64) int {
		if len(vals) == 1 { return 0 }
		pos := int(p*float64(len(vals)-1) + 0.5)
		if pos < 0 { pos = 0 }
		if pos >= len(vals) { pos = len(vals)-1 }
		return pos
	}
	p50 = vals[idx(0.50)]
	p95 = vals[idx(0.95)]
	p99 = vals[idx(0.99)]
	return
}

// Snapshot returns a shallow copy of counters for external inspection/testing.
func (r *RollingMetricsRecorder) Snapshot(adapter string) (requests, success, noFill, timeout int, errors map[string]int, latCount int) {
	r.mu.Lock(); defer r.mu.Unlock()
	requests = r.req[adapter]
	success = r.succ[adapter]
	noFill = r.noFill[adapter]
	timeout = r.timeout[adapter]
	if em, ok := r.err[adapter]; ok {
		errors = make(map[string]int, len(em))
		for k, v := range em { errors[k] = v }
	}
	latCount = len(r.lat[adapter])
	return
}

// SnapshotAll returns a slice of AdapterMetricsSnapshot for all adapters seen by the recorder.
func (r *RollingMetricsRecorder) SnapshotAll() []AdapterMetricsSnapshot {
	// First, under lock, copy all data we need into a local struct to avoid holding the lock
	// while sorting/processing percentiles.
	type snapIn struct {
		adapter       string
		req, succ     int
		nf, to        int
		errs          map[string]int
		latenciesCopy []float64
	}
	var inputs []snapIn
	{
		r.mu.Lock()
		// collect adapter keys
		keysMap := map[string]struct{}{}
		for k := range r.req { keysMap[k] = struct{}{} }
		for k := range r.succ { keysMap[k] = struct{}{} }
		for k := range r.noFill { keysMap[k] = struct{}{} }
		for k := range r.timeout { keysMap[k] = struct{}{} }
		for k := range r.err { keysMap[k] = struct{}{} }
		for k := range r.lat { keysMap[k] = struct{}{} }
		inputs = make([]snapIn, 0, len(keysMap))
		for a := range keysMap {
			var errs map[string]int
			if em, ok := r.err[a]; ok {
				errs = make(map[string]int, len(em))
				for k, v := range em { errs[k] = v }
			}
			inputs = append(inputs, snapIn{
				adapter:       a,
				req:           r.req[a],
				succ:          r.succ[a],
				nf:            r.noFill[a],
				to:            r.timeout[a],
				errs:          errs,
				latenciesCopy: append([]float64(nil), r.lat[a]...),
			})
		}
		r.mu.Unlock()
	}
	out := make([]AdapterMetricsSnapshot, 0, len(inputs))
	for _, in := range inputs {
		p50, p95, p99 := percentileFromSortedCopy(in.latenciesCopy)
		out = append(out, AdapterMetricsSnapshot{
			Adapter:    in.adapter,
			Requests:   in.req,
			Success:    in.succ,
			NoFill:     in.nf,
			Timeout:    in.to,
			Errors:     in.errs,
			LatencyP50: p50,
			LatencyP95: p95,
			LatencyP99: p99,
		})
	}
	return out
}

// percentileFromSortedCopy sorts vals in place and returns p50, p95, p99 (or 0s if empty)
func percentileFromSortedCopy(vals []float64) (p50, p95, p99 float64) {
	if len(vals) == 0 { return 0, 0, 0 }
	sort.Float64s(vals)
	idx := func(p float64) int {
		if len(vals) == 1 { return 0 }
		pos := int(p*float64(len(vals)-1) + 0.5)
		if pos < 0 { pos = 0 }
		if pos >= len(vals) { pos = len(vals)-1 }
		return pos
	}
	return vals[idx(0.50)], vals[idx(0.95)], vals[idx(0.99)]
}

// GetAdapterMetricsSnapshot returns snapshots if the global recorder is a RollingMetricsRecorder.
func GetAdapterMetricsSnapshot() []AdapterMetricsSnapshot {
	if r, ok := metricsRecorder.(*RollingMetricsRecorder); ok {
		return r.SnapshotAll()
	}
	return nil
}

// GetAdapterPercentiles returns current p50/p95/p99 latency percentiles for an adapter
// when the global recorder is a RollingMetricsRecorder. Returns zeros otherwise.
func GetAdapterPercentiles(adapter string) (p50, p95, p99 float64) {
	if r, ok := metricsRecorder.(*RollingMetricsRecorder); ok {
		return r.Percentiles(adapter)
	}
	return 0, 0, 0
}
