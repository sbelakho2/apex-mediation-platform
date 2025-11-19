import { CircuitBreaker, CircuitState, CircuitBreakerRegistry } from '../circuitBreaker';

// Mock logger
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test-adapter', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      monitoringPeriod: 5000,
    });
  });

  describe('initialization', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should use default options if not provided', () => {
      const defaultBreaker = new CircuitBreaker('default');
      const stats = defaultBreaker.getStats();
      
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });
  });

  describe('execute - CLOSED state', () => {
    it('should execute function successfully', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await breaker.execute(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should remain CLOSED after single failure', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));

      await expect(breaker.execute(mockFn)).rejects.toThrow('failure');
      
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      const stats = breaker.getStats();
      expect(stats.failures).toBe(1);
    });

    it('should transition to OPEN after threshold failures', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));

      // Fail 3 times (threshold)
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      await expect(breaker.execute(mockFn)).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should reset failure count after success', async () => {
      const mockFailFn = jest.fn().mockRejectedValue(new Error('failure'));
      const mockSuccessFn = jest.fn().mockResolvedValue('success');

      // 2 failures
      await expect(breaker.execute(mockFailFn)).rejects.toThrow();
      await expect(breaker.execute(mockFailFn)).rejects.toThrow();
      
      // 1 success resets count
      await breaker.execute(mockSuccessFn);
      
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should count failures within monitoring period only', async () => {
      jest.useFakeTimers();
      
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));

      // First failure
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      
      // Advance time beyond monitoring period
      jest.advanceTimersByTime(6000); // 6 seconds (monitoring period is 5s)
      
      // Second failure (first one should be expired)
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      
      jest.useRealTimers();
    });
  });

  describe('execute - OPEN state', () => {
    beforeEach(async () => {
      // Trip the circuit
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should fail fast without executing function', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      await expect(breaker.execute(mockFn)).rejects.toThrow('Circuit breaker test-adapter is OPEN');
      
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      jest.useFakeTimers();
      
      const mockFn = jest.fn().mockResolvedValue('success');

      // Advance time past timeout
      jest.advanceTimersByTime(1100); // timeout is 1000ms
      
      // Should allow execution in HALF_OPEN state
      await breaker.execute(mockFn);
      
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      expect(mockFn).toHaveBeenCalled();
      
      jest.useRealTimers();
    });

    it('should check timeout correctly for state transition', () => {
      jest.useFakeTimers();
      
      expect(breaker.isAllowingRequests()).toBe(false);
      
      jest.advanceTimersByTime(1100);
      
      expect(breaker.isAllowingRequests()).toBe(true);
      
      jest.useRealTimers();
    });
  });

  describe('execute - HALF_OPEN state', () => {
    it('should transition to CLOSED after success threshold', async () => {
      jest.useFakeTimers();
      
      // Trip circuit to OPEN
      const mockFailFn = jest.fn().mockRejectedValue(new Error('failure'));
      await expect(breaker.execute(mockFailFn)).rejects.toThrow();
      await expect(breaker.execute(mockFailFn)).rejects.toThrow();
      await expect(breaker.execute(mockFailFn)).rejects.toThrow();
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      
      // Wait for timeout to transition to HALF_OPEN
      jest.advanceTimersByTime(1100);
      
      const mockSuccessFn = jest.fn().mockResolvedValue('success');

      // Need 2 successes (successThreshold)
      await breaker.execute(mockSuccessFn);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      await breaker.execute(mockSuccessFn);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(mockSuccessFn).toHaveBeenCalledTimes(2);
      
      jest.useRealTimers();
    });

    it('should transition back to OPEN on failure', async () => {
      jest.useFakeTimers();
      
      // Trip circuit to OPEN
      const mockFailFn = jest.fn().mockRejectedValue(new Error('failure'));
      await expect(breaker.execute(mockFailFn)).rejects.toThrow();
      await expect(breaker.execute(mockFailFn)).rejects.toThrow();
      await expect(breaker.execute(mockFailFn)).rejects.toThrow();
      
      // Wait for timeout to transition to HALF_OPEN
      jest.advanceTimersByTime(1100);
      
      const mockSuccessFn = jest.fn().mockResolvedValue('success');
      const mockFailFn2 = jest.fn().mockRejectedValue(new Error('failure'));

      // First success
      await breaker.execute(mockSuccessFn);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      // Failure should reopen circuit
      await expect(breaker.execute(mockFailFn2)).rejects.toThrow('failure');
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      
      jest.useRealTimers();
    });
  });

  describe('manual controls', () => {
    it('should manually open circuit', () => {
      breaker.open();
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should manually close circuit', async () => {
      // Trip circuit
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      
      // Manually close
      breaker.close();
      
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });

    it('should reset all stats', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await breaker.execute(mockFn);
      await breaker.execute(mockFn);
      
      breaker.reset();
      
      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.totalRequests).toBe(0);
      expect(stats.totalSuccesses).toBe(0);
      expect(stats.totalFailures).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should track total requests', async () => {
      const mockSuccessFn = jest.fn().mockResolvedValue('success');
      const mockFailFn = jest.fn().mockRejectedValue(new Error('failure'));

      await breaker.execute(mockSuccessFn);
      await expect(breaker.execute(mockFailFn)).rejects.toThrow();
      await breaker.execute(mockSuccessFn);

      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.totalFailures).toBe(1);
    });

    it('should track last failure time', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      const beforeTime = Date.now();
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      const afterTime = Date.now();

      const stats = breaker.getStats();
      expect(stats.lastFailureTime).toBeGreaterThanOrEqual(beforeTime);
      expect(stats.lastFailureTime).toBeLessThanOrEqual(afterTime);
    });

    it('should calculate health percentage', async () => {
      const mockSuccessFn = jest.fn().mockResolvedValue('success');
      const mockFailFn = jest.fn().mockRejectedValue(new Error('failure'));

      // 3 successes, 1 failure = 75% health
      await breaker.execute(mockSuccessFn);
      await breaker.execute(mockSuccessFn);
      await breaker.execute(mockSuccessFn);
      await expect(breaker.execute(mockFailFn)).rejects.toThrow();

      expect(breaker.getHealthPercentage()).toBe(75);
    });

    it('should return 100% health when no requests', () => {
      expect(breaker.getHealthPercentage()).toBe(100);
    });
  });

  describe('isAllowingRequests', () => {
    it('should allow requests in CLOSED state', () => {
      expect(breaker.isAllowingRequests()).toBe(true);
    });

    it('should not allow requests in OPEN state (before timeout)', async () => {
      // Trip circuit
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      await expect(breaker.execute(mockFn)).rejects.toThrow();

      expect(breaker.isAllowingRequests()).toBe(false);
    });

    it('should allow requests in HALF_OPEN state', async () => {
      jest.useFakeTimers();
      
      // Trip circuit
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      
      // Advance to HALF_OPEN
      jest.advanceTimersByTime(1100);
      
      // Trigger state check by calling isAllowingRequests
      expect(breaker.isAllowingRequests()).toBe(true);
      
      jest.useRealTimers();
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  describe('getBreaker', () => {
    it('should create new breaker on first access', () => {
      const breaker = registry.getBreaker('admob');
      
      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should return same breaker instance on subsequent access', () => {
      const breaker1 = registry.getBreaker('admob');
      const breaker2 = registry.getBreaker('admob');
      
      expect(breaker1).toBe(breaker2);
    });

    it('should create breakers with custom options', () => {
      const breaker = registry.getBreaker('unity', { failureThreshold: 10 });
      
      expect(breaker).toBeDefined();
    });
  });

  describe('getAllBreakers', () => {
    it('should return all registered breakers', () => {
      registry.getBreaker('admob');
      registry.getBreaker('unity');
      registry.getBreaker('ironsource');

      const breakers = registry.getAllBreakers();
      
      expect(breakers.size).toBe(3);
      expect(breakers.has('admob')).toBe(true);
      expect(breakers.has('unity')).toBe(true);
      expect(breakers.has('ironsource')).toBe(true);
    });
  });

  describe('getAllStats', () => {
    it('should return stats for all breakers', async () => {
      const admobBreaker = registry.getBreaker('admob');
      const unityBreaker = registry.getBreaker('unity');

      const mockFn = jest.fn().mockResolvedValue('success');
      await admobBreaker.execute(mockFn);
      await unityBreaker.execute(mockFn);

      const stats = registry.getAllStats();
      
      expect(stats).toHaveProperty('admob');
      expect(stats).toHaveProperty('unity');
      expect(stats.admob.totalRequests).toBe(1);
      expect(stats.unity.totalRequests).toBe(1);
    });
  });

  describe('resetAll', () => {
    it('should reset all circuit breakers', async () => {
      const breaker1 = registry.getBreaker('admob');
      const breaker2 = registry.getBreaker('unity');

      const mockFn = jest.fn().mockResolvedValue('success');
      await breaker1.execute(mockFn);
      await breaker2.execute(mockFn);

      registry.resetAll();

      expect(breaker1.getStats().totalRequests).toBe(0);
      expect(breaker2.getStats().totalRequests).toBe(0);
    });
  });

  describe('getHealthSummary', () => {
    it('should calculate health summary', async () => {
      const admobBreaker = registry.getBreaker('admob');
      const unityBreaker = registry.getBreaker('unity');
      const ironSourceBreaker = registry.getBreaker('ironsource');

      const mockSuccessFn = jest.fn().mockResolvedValue('success');
      const mockFailFn = jest.fn().mockRejectedValue(new Error('failure'));

      // admob: healthy (100%)
      await admobBreaker.execute(mockSuccessFn);
      await admobBreaker.execute(mockSuccessFn);

      // unity: degraded (50%)
      await unityBreaker.execute(mockSuccessFn);
      await expect(unityBreaker.execute(mockFailFn)).rejects.toThrow();

      // ironsource: failed (trip circuit)
      await expect(ironSourceBreaker.execute(mockFailFn)).rejects.toThrow();
      await expect(ironSourceBreaker.execute(mockFailFn)).rejects.toThrow();
      await expect(ironSourceBreaker.execute(mockFailFn)).rejects.toThrow();
      await expect(ironSourceBreaker.execute(mockFailFn)).rejects.toThrow();
      await expect(ironSourceBreaker.execute(mockFailFn)).rejects.toThrow();

      const summary = registry.getHealthSummary();
      
      expect(summary.totalAdapters).toBe(3);
      expect(summary.healthyAdapters).toBeGreaterThanOrEqual(0);
      expect(summary.failedAdapters).toBeGreaterThanOrEqual(1);
      expect(summary.averageHealth).toBeGreaterThanOrEqual(0);
      expect(summary.averageHealth).toBeLessThanOrEqual(100);
    });

    it('should return 100% average health for no adapters', () => {
      const summary = registry.getHealthSummary();
      
      expect(summary.totalAdapters).toBe(0);
      expect(summary.averageHealth).toBe(100);
    });
  });
});
