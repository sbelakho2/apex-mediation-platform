package bidders

import (
    "testing"
    "time"
)

// fakeClock is a controllable clock for deterministic tests
// Start at a fixed point and allow manual advancement.
type fakeClock struct{ now time.Time }

func newFakeClock(start time.Time) *fakeClock { return &fakeClock{now: start} }
func (f *fakeClock) Now() time.Time          { return f.now }
func (f *fakeClock) Advance(d time.Duration) { f.now = f.now.Add(d) }

func TestCircuitBreaker_WithFakeClock_OpenAndCloseDeterministically(t *testing.T) {
    start := time.Unix(1_700_000_000, 0) // arbitrary fixed start
    fc := newFakeClock(start)

    // threshold=3 failures, openFor=30s
    cb := NewCircuitBreakerWithClock(3, 30*time.Second, fc)

    // Initially allowed
    if !cb.Allow() {
        t.Fatalf("expected breaker to allow at start")
    }

    // 1st failure: still closed
    cb.OnFailure()
    if !cb.Allow() {
        t.Fatalf("expected allow after 1 failure")
    }

    // 2nd failure: still closed
    cb.OnFailure()
    if !cb.Allow() {
        t.Fatalf("expected allow after 2 failures")
    }

    // 3rd failure: should open
    cb.OnFailure()
    if cb.Allow() {
        t.Fatalf("expected breaker to be open (disallow) after threshold failures")
    }

    // Advance less than open duration: still open
    fc.Advance(29 * time.Second)
    if cb.Allow() {
        t.Fatalf("expected breaker to remain open before openFor elapsed")
    }

    // Advance to the open duration boundary: should close (allow)
    fc.Advance(1 * time.Second)
    if !cb.Allow() {
        t.Fatalf("expected breaker to allow after openFor elapsed")
    }

    // OnSuccess should reset internal counters and ensure closed state
    cb.OnSuccess()
    if !cb.Allow() {
        t.Fatalf("expected breaker to allow after success reset")
    }
}
