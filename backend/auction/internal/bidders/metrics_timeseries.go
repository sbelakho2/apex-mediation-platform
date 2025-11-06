package bidders

import (
	"sort"
	"sync"
	"time"
)

// TimeSeriesBucket holds counters and latency histogram for a fixed time window.
// This structure is optimized for JSON exposure and simple SLO computations.
type TimeSeriesBucket struct {
	StartUnix int64            `json:"start_unix"` // inclusive bucket start (UTC)
	DurationS int64            `json:"duration_s"`
	Requests  int              `json:"requests"`
	Success   int              `json:"success"`
	NoFill    int              `json:"no_fill"`
	Timeout   int              `json:"timeout"`
	Errors    map[string]int   `json:"errors,omitempty"`
	// Latency histogram counts in milliseconds (upper bounds of each bin)
	// Bins: [25, 50, 100, 200, 400, 800, 1600, +Inf]
	LatBins   [8]int           `json:"lat_bins"`
}

// AdapterSeries is the set of buckets for one adapter.
// The buffer is a ring that retains at most maxBuckets entries.
type AdapterSeries struct {
	buckets    []TimeSeriesBucket
	bucketSize time.Duration
	maxBuckets int
}

// TimeSeriesAggregator keeps per-adapter time series buckets.
// It implements the same signals as MetricsRecorder but stores them into fixed time buckets.
type TimeSeriesAggregator struct {
	mu         sync.Mutex
	adapters   map[string]*AdapterSeries
	bucketSize time.Duration
	retention  time.Duration
}

const (
	defaultBucketSize = 5 * time.Minute
	defaultRetention  = 7 * 24 * time.Hour
)

var globalTS *TimeSeriesAggregator

// SetTimeSeriesAggregator installs a global aggregator used by helper wrappers.
func SetTimeSeriesAggregator(ts *TimeSeriesAggregator) { if ts != nil { globalTS = ts } }

// NewTimeSeriesAggregator creates a new aggregator with given bucket size and retention window.
func NewTimeSeriesAggregator(bucketSize, retention time.Duration) *TimeSeriesAggregator {
	if bucketSize <= 0 { bucketSize = defaultBucketSize }
	if retention <= 0 { retention = defaultRetention }
	return &TimeSeriesAggregator{
		adapters:   map[string]*AdapterSeries{},
		bucketSize: bucketSize,
		retention:  retention,
	}
}

// --- Recording methods (mirrors MetricsRecorder semantics) ---
func (ts *TimeSeriesAggregator) IncRequest(adapter string)  { ts.withBucket(adapter, time.Now(), func(b *TimeSeriesBucket) { b.Requests++ }) }
func (ts *TimeSeriesAggregator) IncSuccess(adapter string)  { ts.withBucket(adapter, time.Now(), func(b *TimeSeriesBucket) { b.Success++ }) }
func (ts *TimeSeriesAggregator) IncNoFill(adapter string)   { ts.withBucket(adapter, time.Now(), func(b *TimeSeriesBucket) { b.NoFill++ }) }
func (ts *TimeSeriesAggregator) IncTimeout(adapter string)  { ts.withBucket(adapter, time.Now(), func(b *TimeSeriesBucket) { b.Timeout++ }) }
func (ts *TimeSeriesAggregator) IncError(adapter, reason string) { ts.withBucket(adapter, time.Now(), func(b *TimeSeriesBucket) {
		if b.Errors == nil { b.Errors = map[string]int{} }
		b.Errors[reason] = b.Errors[reason] + 1
	}) }
func (ts *TimeSeriesAggregator) ObserveLatencyMS(adapter string, ms float64) {
	ts.withBucket(adapter, time.Now(), func(b *TimeSeriesBucket) {
		idx := latencyBinIndex(ms)
		b.LatBins[idx] = b.LatBins[idx] + 1
	})
}

func latencyBinIndex(ms float64) int {
	bounds := [...]float64{25, 50, 100, 200, 400, 800, 1600}
	for i, ub := range bounds { if ms <= ub { return i } }
	return len(bounds) // +Inf bin
}

func floorToBucketStart(t time.Time, size time.Duration) time.Time {
	utc := t.UTC()
	// Convert to epoch minutes, floor to bucket
	sec := utc.Unix()
	bucket := (sec / int64(size.Seconds())) * int64(size.Seconds())
	return time.Unix(bucket, 0).UTC()
}

func (ts *TimeSeriesAggregator) seriesFor(adapter string) *AdapterSeries {
	ts.mu.Lock(); defer ts.mu.Unlock()
	ser, ok := ts.adapters[adapter]
	if ok { return ser }
	maxBuckets := int(ts.retention / ts.bucketSize)
	if maxBuckets < 1 { maxBuckets = 1 }
	ser = &AdapterSeries{bucketSize: ts.bucketSize, maxBuckets: maxBuckets}
	ts.adapters[adapter] = ser
	return ser
}

func (ts *TimeSeriesAggregator) withBucket(adapter string, now time.Time, fn func(*TimeSeriesBucket)) {
	ser := ts.seriesFor(adapter)
	ts.mu.Lock(); defer ts.mu.Unlock()
	start := floorToBucketStart(now, ts.bucketSize)
	// get last bucket or append new
	if n := len(ser.buckets); n > 0 {
		last := &ser.buckets[n-1]
		if time.Unix(last.StartUnix, 0).UTC().Equal(start) {
			fn(last)
			ts.trimLocked(ser)
			return
		}
	}
	// append new bucket
	b := TimeSeriesBucket{StartUnix: start.Unix(), DurationS: int64(ts.bucketSize.Seconds())}
	ser.buckets = append(ser.buckets, b)
	fn(&ser.buckets[len(ser.buckets)-1])
	// enforce ring buffer size
	ts.trimLocked(ser)
}

func (ts *TimeSeriesAggregator) trimLocked(ser *AdapterSeries) {
	if len(ser.buckets) > ser.maxBuckets {
		ser.buckets = ser.buckets[len(ser.buckets)-ser.maxBuckets:]
	}
}

// Snapshot returns time series buckets for the given adapter for up to the requested duration.
// If adapter is empty, returns all adapters in a map.
type AdapterSeriesSnapshot struct {
	Adapter string             `json:"adapter"`
	Buckets []TimeSeriesBucket `json:"buckets"`
}

// SnapshotAll returns snapshots for all adapters, limited to the last N buckets that fit within maxAge.
func (ts *TimeSeriesAggregator) SnapshotAll(maxAge time.Duration) []AdapterSeriesSnapshot {
	ts.mu.Lock(); defer ts.mu.Unlock()
	adapters := make([]string, 0, len(ts.adapters))
	for a := range ts.adapters { adapters = append(adapters, a) }
	sort.Strings(adapters)

	cutoff := time.Now().Add(-maxAge).Unix()
	out := make([]AdapterSeriesSnapshot, 0, len(adapters))
	for _, a := range adapters {
		ser := ts.adapters[a]
		var filtered []TimeSeriesBucket
		for _, b := range ser.buckets {
			if b.StartUnix >= cutoff {
				filtered = append(filtered, b)
			}
		}
		out = append(out, AdapterSeriesSnapshot{Adapter: a, Buckets: filtered})
	}
	return out
}

// EstimateP95 returns p95 latency in milliseconds for a bucket using the histogram bins.
func (b *TimeSeriesBucket) EstimateP95() float64 {
	total := 0
	for _, c := range b.LatBins { total += c }
	if total == 0 { return 0 }
	threshold := int(float64(total) * 0.95)
	cum := 0
	bounds := [...]float64{25, 50, 100, 200, 400, 800, 1600, 3200}
	for i, c := range b.LatBins {
		cum += c
		if cum >= threshold {
			// return upper bound as estimate
			return bounds[i]
		}
	}
	return 3200
}

// AggregateWindow computes aggregate counters for the last window duration across adapters.
// Returns a map adapter->(req,err,nofill,timeout,success) and p95 estimation using last bucket.
type WindowAggregate struct {
	Adapter       string            `json:"adapter"`
	Requests      int               `json:"requests"`
	Errors        int               `json:"errors"`
	NoFill        int               `json:"no_fill"`
	Timeout       int               `json:"timeout"`
	Success       int               `json:"success"`
	LastBucketP95 float64           `json:"last_bucket_p95_ms"`
}

func (ts *TimeSeriesAggregator) AggregateWindow(window time.Duration) []WindowAggregate {
	snaps := ts.SnapshotAll(window)
	out := make([]WindowAggregate, 0, len(snaps))
	for _, s := range snaps {
		agg := WindowAggregate{Adapter: s.Adapter}
		for i := range s.Buckets {
			b := s.Buckets[i]
			agg.Requests += b.Requests
			agg.NoFill += b.NoFill
			agg.Timeout += b.Timeout
			agg.Success += b.Success
			if len(b.Errors) > 0 {
				for _, v := range b.Errors { agg.Errors += v }
			}
			agg.LastBucketP95 = b.EstimateP95()
		}
		out = append(out, agg)
	}
	return out
}

// GetTimeSeriesSnapshot exposes snapshots when globalTS is active.
func GetTimeSeriesSnapshot(maxAge time.Duration) []AdapterSeriesSnapshot {
	if globalTS == nil { return nil }
	return globalTS.SnapshotAll(maxAge)
}

// GetWindowAggregates exposes aggregates when globalTS is active.
func GetWindowAggregates(window time.Duration) []WindowAggregate {
	if globalTS == nil { return nil }
	return globalTS.AggregateWindow(window)
}
