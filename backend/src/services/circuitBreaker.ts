import logger from '../utils/logger';

export interface CircuitBreakerOptions {
  failureThreshold: number;      // Number of failures before opening circuit
  successThreshold: number;      // Number of successes to close circuit from half-open
  timeout: number;               // Timeout in ms before attempting half-open
  monitoringPeriod: number;      // Time window for counting failures (ms)
}

export enum CircuitState {
  CLOSED = 'CLOSED',       // Normal operation, requests pass through
  OPEN = 'OPEN',           // Circuit tripped, requests fail fast
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  nextAttemptTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

/**
 * Circuit Breaker for Network Adapters
 * 
 * Implements the circuit breaker pattern to protect against cascading failures
 * when network adapters (AdMob, Unity, etc.) are unavailable or timing out.
 * 
 * States:
 * - CLOSED: Normal operation, all requests pass through
 * - OPEN: Circuit tripped due to failures, requests fail fast without calling adapter
 * - HALF_OPEN: Testing if adapter recovered, limited requests allowed
 * 
 * Transitions:
 * - CLOSED -> OPEN: After failureThreshold failures within monitoringPeriod
 * - OPEN -> HALF_OPEN: After timeout duration
 * - HALF_OPEN -> CLOSED: After successThreshold consecutive successes
 * - HALF_OPEN -> OPEN: On any failure
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number | null = null;
  private nextAttemptTime: number | null = null;
  private failureTimestamps: number[] = [];
  
  // Statistics
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;

  private readonly name: string;
  private readonly options: CircuitBreakerOptions;

  constructor(
    name: string,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    this.name = name;
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      timeout: options.timeout || 60000, // 60 seconds
      monitoringPeriod: options.monitoringPeriod || 120000, // 2 minutes
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.nextAttemptTime && Date.now() >= this.nextAttemptTime) {
        // Transition to half-open
        this.state = CircuitState.HALF_OPEN;
        this.successes = 0;
        logger.info(`Circuit breaker ${this.name} transitioning to HALF_OPEN`);
      } else {
        // Fail fast
        const error = new Error(`Circuit breaker ${this.name} is OPEN`);
        logger.warn(`Circuit breaker ${this.name} rejecting request (OPEN)`, {
          nextAttemptTime: this.nextAttemptTime,
        });
        throw error;
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record successful execution
   */
  private onSuccess(): void {
    this.totalSuccesses++;
    this.failureTimestamps = [];

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      
      if (this.successes >= this.options.successThreshold) {
        // Transition to closed
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.lastFailureTime = null;
        this.nextAttemptTime = null;
        logger.info(`Circuit breaker ${this.name} transitioning to CLOSED`, {
          successThreshold: this.options.successThreshold,
        });
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Record failed execution
   */
  private onFailure(): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.failureTimestamps.push(this.lastFailureTime);

    // Remove old failure timestamps outside monitoring period
    const cutoffTime = this.lastFailureTime - this.options.monitoringPeriod;
    this.failureTimestamps = this.failureTimestamps.filter(
      (timestamp) => timestamp > cutoffTime
    );

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens circuit
      this.state = CircuitState.OPEN;
      this.failures = 0;
      this.successes = 0;
      this.nextAttemptTime = Date.now() + this.options.timeout;
      
      logger.warn(`Circuit breaker ${this.name} transitioning to OPEN (failed in HALF_OPEN)`, {
        nextAttemptTime: this.nextAttemptTime,
      });
    } else if (this.state === CircuitState.CLOSED) {
      this.failures = this.failureTimestamps.length;

      if (this.failures >= this.options.failureThreshold) {
        // Trip circuit
        this.state = CircuitState.OPEN;
        this.nextAttemptTime = Date.now() + this.options.timeout;
        
        logger.error(`Circuit breaker ${this.name} transitioning to OPEN`, {
          failures: this.failures,
          threshold: this.options.failureThreshold,
          monitoringPeriod: this.options.monitoringPeriod,
          nextAttemptTime: this.nextAttemptTime,
        });
      }
    }
  }

  /**
   * Manually open the circuit
   */
  open(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.options.timeout;
    logger.warn(`Circuit breaker ${this.name} manually opened`);
  }

  /**
   * Manually close the circuit
   */
  close(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.failureTimestamps = [];
    logger.info(`Circuit breaker ${this.name} manually closed`);
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.failureTimestamps = [];
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    logger.info(`Circuit breaker ${this.name} reset`);
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Check if circuit is allowing requests
   */
  isAllowingRequests(): boolean {
    if (this.state === CircuitState.CLOSED || this.state === CircuitState.HALF_OPEN) {
      return true;
    }

    // Check if timeout has passed and circuit should transition to half-open
    if (this.state === CircuitState.OPEN && this.nextAttemptTime) {
      return Date.now() >= this.nextAttemptTime;
    }

    return false;
  }

  /**
   * Get circuit health (success rate)
   */
  getHealthPercentage(): number {
    if (this.totalRequests === 0) {
      return 100;
    }
    return (this.totalSuccesses / this.totalRequests) * 100;
  }
}

/**
 * Circuit Breaker Registry for managing multiple adapters
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create circuit breaker for adapter
   */
  getBreaker(
    adapterName: string,
    options?: Partial<CircuitBreakerOptions>
  ): CircuitBreaker {
    if (!this.breakers.has(adapterName)) {
      this.breakers.set(adapterName, new CircuitBreaker(adapterName, options));
    }
    return this.breakers.get(adapterName)!;
  }

  /**
   * Get all circuit breakers
   */
  getAllBreakers(): Map<string, CircuitBreaker> {
    return this.breakers;
  }

  /**
   * Get stats for all circuit breakers
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }

    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    logger.info('All circuit breakers reset');
  }

  /**
   * Get health summary
   */
  getHealthSummary(): {
    totalAdapters: number;
    healthyAdapters: number;
    degradedAdapters: number;
    failedAdapters: number;
    averageHealth: number;
  } {
    let healthyCount = 0;
    let degradedCount = 0;
    let failedCount = 0;
    let totalHealth = 0;

    for (const breaker of this.breakers.values()) {
      const health = breaker.getHealthPercentage();
      totalHealth += health;

      if (breaker.getState() === CircuitState.OPEN) {
        failedCount++;
      } else if (breaker.getState() === CircuitState.HALF_OPEN) {
        degradedCount++;
      } else if (health >= 95) {
        healthyCount++;
      } else {
        degradedCount++;
      }
    }

    return {
      totalAdapters: this.breakers.size,
      healthyAdapters: healthyCount,
      degradedAdapters: degradedCount,
      failedAdapters: failedCount,
      averageHealth: this.breakers.size > 0 ? totalHealth / this.breakers.size : 100,
    };
  }
}
