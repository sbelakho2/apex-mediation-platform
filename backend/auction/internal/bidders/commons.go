package bidders
import (
	"context"
	"errors"
	"math/rand"
	"net"
	"time"
)

// Normalized NoBid taxonomy constants for analytics and debugging
const (
	NoBidTimeout      = "timeout"
	NoBidNetworkError = "network_error"
	NoBidStatusPrefix = "status_"
	NoBidNoFill       = "no_fill"
	NoBidCircuitOpen  = "circuit_open"
	NoBidError        = "error"
	NoBidBelowFloor   = "below_floor"
)

// DoWithRetry executes op with a single retry and small jitter for transient errors.
// Policy:
// - maxAttempts = 2 (initial try + 1 retry)
// - jitter between 10–100ms between attempts
// - retries only on transient errors (timeouts, context cancellations, net errors, status_5xx)
func DoWithRetry(ctx context.Context, op func() error) error {
	const maxAttempts = 2
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		err := op()
		if err == nil {
			return nil
		}
		if attempt == maxAttempts || !IsTransient(err) {
			return err
		}
		// small jitter before retry
		jitter := time.Duration(10+rand.Intn(91)) * time.Millisecond // 10–100ms
		select {
		case <-time.After(jitter):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return nil
}

// IsTransient classifies an error as transient, eligible for retry.
// Considered transient:
// - net.Error that is timeout or temporary
// - context.DeadlineExceeded or context.Canceled
// - encoded HTTP status errors of the form "status_5xx"
func IsTransient(err error) bool {
	if err == nil {
		return false
	}
	if ne, ok := err.(net.Error); ok {
		if ne.Timeout() {
			return true
		}
		// Some implementations expose Temporary(); if present, treat as transient
		type temporary interface{ Temporary() bool }
		if t, ok := any(ne).(temporary); ok && t.Temporary() {
			return true
		}
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return true
	}
	// Encoded status errors such as "status_500"
	msg := err.Error()
	if len(msg) >= len(NoBidStatusPrefix) && msg[:len(NoBidStatusPrefix)] == NoBidStatusPrefix {
		// If 5xx, treat transient
		if len(msg) >= len(NoBidStatusPrefix)+3 && msg[len(NoBidStatusPrefix)] == '5' { // best-effort check
			return true
		}
	}
	return false
}

// MapErrorToNoBid maps an error to a standardized NoBid reason for analytics and debugging.
// Standard taxonomy: timeout, network_error, status_XXX, no_fill, circuit_open, error
func MapErrorToNoBid(err error) string {
	if err == nil {
		return "unknown"
	}
	// Preserve encoded HTTP status reason
	msg := err.Error()
	if len(msg) >= 8 && msg[:7] == "status_" {
		return msg
	}
	if msg == "no_fill" {
		return "no_fill"
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return "timeout"
	}
	if ne, ok := err.(net.Error); ok {
		if ne.Timeout() {
			return "timeout"
		}
		return "network_error"
	}
	return "error"
}

// Clock provides current time (for deterministic tests)
type Clock interface {
	Now() time.Time
}

type realClock struct{}
func (realClock) Now() time.Time { return time.Now() }

// CircuitBreaker is a tiny in-memory breaker intended for per-adapter instances.
// Usage:
//   if !cb.Allow() { return circuit_open }
//   ... do work ... then cb.OnSuccess() or cb.OnFailure()
// Opens after "threshold" consecutive failures and stays open for "openFor" duration.
// Note: not concurrency-safe; intended to be used behind adapter instance serialization or with external synchronization if required.
type CircuitBreaker struct {
	threshold int
	openFor  time.Duration
	clock    Clock

	failCount int
	openUntil time.Time
}

// NewCircuitBreaker constructs a breaker using the real system clock.
func NewCircuitBreaker(threshold int, openFor time.Duration) *CircuitBreaker {
	return NewCircuitBreakerWithClock(threshold, openFor, realClock{})
}

// NewCircuitBreakerWithClock allows injecting a custom clock (for tests).
func NewCircuitBreakerWithClock(threshold int, openFor time.Duration, clk Clock) *CircuitBreaker {
	if threshold <= 0 {
		threshold = 3
	}
	if openFor <= 0 {
		openFor = 30 * time.Second
	}
	if clk == nil { clk = realClock{} }
	return &CircuitBreaker{threshold: threshold, openFor: openFor, clock: clk}
}

// Allow returns false if the breaker is open.
func (c *CircuitBreaker) Allow() bool {
	return c.clock.Now().After(c.openUntil)
}

// OnFailure records a failure and opens the breaker when threshold is reached.
func (c *CircuitBreaker) OnFailure() {
	c.failCount++
	if c.failCount >= c.threshold {
		c.openUntil = c.clock.Now().Add(c.openFor)
		c.failCount = 0
	}
}

// OnSuccess resets failure counters and closes the breaker.
func (c *CircuitBreaker) OnSuccess() {
	c.failCount = 0
	c.openUntil = time.Time{}
}

// maskKey masks sensitive keys for safe logging (keeps first 4 and last 2 chars)
func maskKey(key string) string {
	if len(key) <= 6 {
		return key
	}
	return key[:4] + "..." + key[len(key)-2:]
}
