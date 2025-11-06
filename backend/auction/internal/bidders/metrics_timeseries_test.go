package bidders

import (
	"testing"
	"time"
)

func TestTimeSeries_BucketRolloverAndRetention(t *testing.T) {
	ts := NewTimeSeriesAggregator(1*time.Second, 3*time.Second) // 1s buckets, keep last 3
	adapter := "admob"
	start := time.Unix(1000, 0).UTC()

	// Create 5 sequential buckets; retention should keep last 3
	for i := 0; i < 5; i++ {
		now := start.Add(time.Duration(i) * time.Second)
		ts.withBucket(adapter, now, func(b *TimeSeriesBucket) {
			b.Requests++
			b.Success++
		})
	}

	snaps := ts.SnapshotAll(10 * time.Second)
	if len(snaps) != 1 {
		t.Fatalf("expected 1 adapter snapshot, got %d", len(snaps))
	}
	if got := len(snaps[0].Buckets); got != 3 {
		t.Fatalf("expected 3 buckets due to retention, got %d", got)
	}
	// Buckets should be the last 3: starts at 1002, 1003, 1004
	if snaps[0].Buckets[0].StartUnix != 1002 {
		t.Fatalf("unexpected first bucket start: %d", snaps[0].Buckets[0].StartUnix)
	}
}

func TestTimeSeries_P95Estimation(t *testing.T) {
	ts := NewTimeSeriesAggregator(60*time.Second, 10*time.Minute)
	adapter := "meta"
	t0 := time.Unix(2000, 0).UTC()
	// Create one bucket with a histogram skewed to 200-400ms
	ts.withBucket(adapter, t0, func(b *TimeSeriesBucket) {
		b.Requests = 100
		b.LatBins = [8]int{0, 0, 10, 60, 25, 5, 0, 0} // 100 samples, 95th should be within the 400ms bin
	})
	snaps := ts.SnapshotAll(5 * time.Minute)
	if len(snaps) != 1 || len(snaps[0].Buckets) != 1 {
		t.Fatalf("expected 1 bucket")
	}
	p95 := snaps[0].Buckets[0].EstimateP95()
	if p95 != 400 {
		t.Fatalf("expected p95=400ms from bins, got %v", p95)
	}
}
