package timeout

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// TimeoutConfig defines timeout settings per ad type
type TimeoutConfig struct {
	Banner               time.Duration
	Interstitial         time.Duration
	Rewarded             time.Duration
	RewardedInterstitial time.Duration
	Native               time.Duration
	AppOpen              time.Duration
}

// DefaultTimeoutConfig returns graduated timeouts per ad type
func DefaultTimeoutConfig() TimeoutConfig {
	return TimeoutConfig{
		Banner:               5 * time.Second,
		Interstitial:         10 * time.Second,
		Rewarded:             12 * time.Second,
		RewardedInterstitial: 11 * time.Second,
		Native:               7 * time.Second,
		AppOpen:              8 * time.Second,
	}
}

// GetTimeout returns timeout for specific ad type
func (tc TimeoutConfig) GetTimeout(adType string) time.Duration {
	switch adType {
	case "banner":
		return tc.Banner
	case "interstitial":
		return tc.Interstitial
	case "rewarded":
		return tc.Rewarded
	case "rewarded_interstitial":
		return tc.RewardedInterstitial
	case "native":
		return tc.Native
	case "app_open":
		return tc.AppOpen
	default:
		return 10 * time.Second
	}
}

// CircuitBreaker implements circuit breaker pattern for adapters
type CircuitBreaker struct {
	maxFailures  int
	resetTimeout time.Duration

	mu           sync.RWMutex
	failures     map[string]int
	lastFailTime map[string]time.Time
	state        map[string]CircuitState
}

// CircuitState represents circuit breaker state
type CircuitState string

const (
	StateClosed   CircuitState = "closed"    // Normal operation
	StateOpen     CircuitState = "open"      // Failures exceeded, blocking requests
	StateHalfOpen CircuitState = "half_open" // Testing if service recovered
)

// NewCircuitBreaker creates a new circuit breaker
func NewCircuitBreaker(maxFailures int, resetTimeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		maxFailures:  maxFailures,
		resetTimeout: resetTimeout,
		failures:     make(map[string]int),
		lastFailTime: make(map[string]time.Time),
		state:        make(map[string]CircuitState),
	}
}

// Call executes function with circuit breaker protection
func (cb *CircuitBreaker) Call(adapterName string, fn func() error) error {
	cb.mu.RLock()
	state := cb.getState(adapterName)
	cb.mu.RUnlock()

	switch state {
	case StateOpen:
		// Check if reset timeout passed
		cb.mu.RLock()
		lastFail := cb.lastFailTime[adapterName]
		cb.mu.RUnlock()

		if time.Since(lastFail) > cb.resetTimeout {
			// Move to half-open state
			cb.mu.Lock()
			cb.state[adapterName] = StateHalfOpen
			cb.mu.Unlock()
		} else {
			return fmt.Errorf("circuit breaker open for adapter %s", adapterName)
		}
	}

	// Execute function
	err := fn()

	cb.mu.Lock()
	defer cb.mu.Unlock()

	if err != nil {
		cb.recordFailure(adapterName)
		return err
	}

	cb.recordSuccess(adapterName)
	return nil
}

// getState returns current circuit state
func (cb *CircuitBreaker) getState(adapterName string) CircuitState {
	if state, ok := cb.state[adapterName]; ok {
		return state
	}
	return StateClosed
}

// recordFailure records a failure
func (cb *CircuitBreaker) recordFailure(adapterName string) {
	cb.failures[adapterName]++
	cb.lastFailTime[adapterName] = time.Now()

	if cb.failures[adapterName] >= cb.maxFailures {
		cb.state[adapterName] = StateOpen
	}
}

// recordSuccess records a success
func (cb *CircuitBreaker) recordSuccess(adapterName string) {
	cb.failures[adapterName] = 0
	cb.state[adapterName] = StateClosed
}

// GetState returns current state for an adapter
func (cb *CircuitBreaker) GetState(adapterName string) CircuitState {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.getState(adapterName)
}

// Reset resets circuit breaker for an adapter
func (cb *CircuitBreaker) Reset(adapterName string) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.failures[adapterName] = 0
	cb.state[adapterName] = StateClosed
	delete(cb.lastFailTime, adapterName)
}

// ParallelRequestManager handles parallel adapter requests with early termination
type ParallelRequestManager struct {
	circuitBreaker *CircuitBreaker
	timeoutConfig  TimeoutConfig
}

// NewParallelRequestManager creates a new parallel request manager
func NewParallelRequestManager(cb *CircuitBreaker, tc TimeoutConfig) *ParallelRequestManager {
	return &ParallelRequestManager{
		circuitBreaker: cb,
		timeoutConfig:  tc,
	}
}

// AdapterRequest represents a request to an adapter
type AdapterRequest struct {
	AdapterName string
	Priority    int
	Fn          func(ctx context.Context) (interface{}, error)
}

// RequestResult represents the result of an adapter request
type RequestResult struct {
	AdapterName string
	Result      interface{}
	Error       error
	Duration    time.Duration
}

// ExecuteParallel executes adapter requests in parallel with early termination
func (prm *ParallelRequestManager) ExecuteParallel(
	ctx context.Context,
	adType string,
	requests []AdapterRequest,
	earlyTermination bool,
) []RequestResult {
	timeout := prm.timeoutConfig.GetTimeout(adType)
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	resultChan := make(chan RequestResult, len(requests))
	var wg sync.WaitGroup

	// Launch all requests in parallel
	for _, req := range requests {
		wg.Add(1)
		go func(r AdapterRequest) {
			defer wg.Done()

			startTime := time.Now()

			// Check circuit breaker
			if state := prm.circuitBreaker.GetState(r.AdapterName); state == StateOpen {
				resultChan <- RequestResult{
					AdapterName: r.AdapterName,
					Error:       fmt.Errorf("circuit breaker open"),
					Duration:    0,
				}
				return
			}

			// Execute request with circuit breaker
			var result interface{}
			err := prm.circuitBreaker.Call(r.AdapterName, func() error {
				var execErr error
				result, execErr = r.Fn(ctx)
				return execErr
			})

			resultChan <- RequestResult{
				AdapterName: r.AdapterName,
				Result:      result,
				Error:       err,
				Duration:    time.Since(startTime),
			}
		}(req)
	}

	// Wait for all requests or early termination
	go func() {
		wg.Wait()
		close(resultChan)
	}()

	var results []RequestResult
	successCount := 0

	// Iterate over results with ability to break out on context cancellation
resultLoop:
	for result := range resultChan {
		results = append(results, result)

		// Early termination on first success
		if earlyTermination && result.Error == nil {
			successCount++
			if successCount >= 1 {
				cancel() // Cancel remaining requests
				break
			}
		}

		// Check context cancellation
		select {
		case <-ctx.Done():
			// Break out of the outer results loop when context is cancelled
			break resultLoop
		default:
		}
	}

	// Collect any remaining results
	for result := range resultChan {
		results = append(results, result)
	}

	return results
}

// ExecuteWaterfall executes adapter requests sequentially (waterfall)
func (prm *ParallelRequestManager) ExecuteWaterfall(
	ctx context.Context,
	adType string,
	requests []AdapterRequest,
) RequestResult {
	timeout := prm.timeoutConfig.GetTimeout(adType)
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Try adapters in priority order
	for _, req := range requests {
		// Check context
		select {
		case <-ctx.Done():
			return RequestResult{
				AdapterName: "waterfall",
				Error:       fmt.Errorf("waterfall timeout"),
			}
		default:
		}

		// Check circuit breaker
		if state := prm.circuitBreaker.GetState(req.AdapterName); state == StateOpen {
			continue
		}

		startTime := time.Now()

		// Execute request
		var result interface{}
		err := prm.circuitBreaker.Call(req.AdapterName, func() error {
			var execErr error
			result, execErr = req.Fn(ctx)
			return execErr
		})

		if err == nil {
			return RequestResult{
				AdapterName: req.AdapterName,
				Result:      result,
				Error:       nil,
				Duration:    time.Since(startTime),
			}
		}
	}

	return RequestResult{
		AdapterName: "waterfall",
		Error:       fmt.Errorf("no adapters returned ads"),
	}
}

// AdapterTimeout represents per-adapter timeout configuration
type AdapterTimeout struct {
	mu       sync.RWMutex
	timeouts map[string]time.Duration
}

// NewAdapterTimeout creates a new adapter timeout manager
func NewAdapterTimeout() *AdapterTimeout {
	return &AdapterTimeout{
		timeouts: make(map[string]time.Duration),
	}
}

// SetTimeout sets timeout for specific adapter
func (at *AdapterTimeout) SetTimeout(adapterName string, timeout time.Duration) {
	at.mu.Lock()
	defer at.mu.Unlock()
	at.timeouts[adapterName] = timeout
}

// GetTimeout gets timeout for specific adapter
func (at *AdapterTimeout) GetTimeout(adapterName string, defaultTimeout time.Duration) time.Duration {
	at.mu.RLock()
	defer at.mu.RUnlock()

	if timeout, ok := at.timeouts[adapterName]; ok {
		return timeout
	}
	return defaultTimeout
}

// AdjustTimeout adjusts timeout based on historical performance
func (at *AdapterTimeout) AdjustTimeout(adapterName string, avgLatency time.Duration) {
	// Set timeout to 2x average latency with min 1s, max 15s
	timeout := avgLatency * 2

	if timeout < 1*time.Second {
		timeout = 1 * time.Second
	} else if timeout > 15*time.Second {
		timeout = 15 * time.Second
	}

	at.SetTimeout(adapterName, timeout)
}
