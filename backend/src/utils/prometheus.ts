import { collectDefaultMetrics, register, Histogram, Counter } from 'prom-client';

const collectDefaults = process.env.PROMETHEUS_COLLECT_DEFAULTS !== '0';

if (collectDefaults) {
  collectDefaultMetrics();
}

export const promRegister = register;

export async function getPrometheusMetrics(): Promise<string> {
  return register.metrics();
}

// HTTP request duration histogram (seconds) - RED metrics (Rate, Errors, Duration)
export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds (p50, p95, p99 per route)',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

// HTTP request counter (for rate calculation)
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
});

// RTB auction latency histogram (seconds)
export const auctionLatencySeconds = new Histogram({
  name: 'auction_latency_seconds',
  help: 'Latency of RTB auction decisions in seconds',
  labelNames: ['arm', 'exp_id'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

// Adapter latency histogram (seconds)
export const rtbAdapterLatencySeconds = new Histogram({
  name: 'rtb_adapter_latency_seconds',
  help: 'Latency per RTB adapter in seconds',
  labelNames: ['adapter'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
});

// Adapter timeout counter
export const rtbAdapterTimeoutsTotal = new Counter({
  name: 'rtb_adapter_timeouts_total',
  help: 'Total adapter timeouts',
  labelNames: ['adapter'] as const,
});

// Wins and no-fill
export const rtbWinsTotal = new Counter({
  name: 'rtb_wins_total',
  help: 'Total number of RTB auction wins by adapter',
  labelNames: ['adapter', 'arm', 'exp_id'] as const,
});

export const rtbNoFillTotal = new Counter({
  name: 'rtb_no_fill_total',
  help: 'Total number of RTB auctions resulting in no fill',
  labelNames: ['arm', 'exp_id'] as const,
});

// RTB error taxonomy counter
export const rtbErrorsTotal = new Counter({
  name: 'rtb_errors_total',
  help: 'Total number of RTB errors by code and adapter',
  labelNames: ['code', 'adapter', 'arm', 'exp_id'] as const,
});

// Database query duration histogram (seconds)
export const dbQueryDurationSeconds = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of PostgreSQL queries in seconds',
  labelNames: ['operation'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
});

// Error counter
export const errorCounter = new Counter({
  name: 'app_errors_total',
  help: 'Total number of application errors',
  labelNames: ['type'] as const,
});

// Tracking-specific counters (public endpoints)
export const trackingRateLimitedTotal = new Counter({
  name: 'tracking_rate_limited_total',
  help: 'Total number of tracking requests that were rate limited',
});

export const trackingBlockedTotal = new Counter({
  name: 'tracking_blocked_total',
  help: 'Total number of tracking requests blocked by WAF/UA rules',
  labelNames: ['reason'] as const,
});

export const trackingHeadTotal = new Counter({
  name: 'tracking_head_total',
  help: 'Total number of HEAD requests to tracking endpoints',
});

// Analytics ingestion (queue-based) metrics
export const analyticsEventsEnqueuedTotal = new Counter({
  name: 'analytics_events_enqueued_total',
  help: 'Total analytics events enqueued for ingestion',
  labelNames: ['kind'] as const,
});

export const analyticsEventsWrittenTotal = new Counter({
  name: 'analytics_events_written_total',
  help: 'Total analytics events successfully written to ClickHouse',
  labelNames: ['kind'] as const,
});

export const analyticsEventsFailedTotal = new Counter({
  name: 'analytics_events_failed_total',
  help: 'Total analytics events failed to write to ClickHouse',
  labelNames: ['kind'] as const,
});

// Billing and Stripe-related counters
export const billingUsageLimitExceededTotal = new Counter({
  name: 'billing_usage_limit_exceeded_total',
  help: 'Total number of times an organization exceeded usage limits',
  labelNames: ['org_id'] as const,
});

export const stripeUsageSyncSuccessTotal = new Counter({
  name: 'stripe_usage_sync_success_total',
  help: 'Total number of successful Stripe usage sync operations',
  labelNames: ['org_id'] as const,
});

export const stripeUsageSyncFailuresTotal = new Counter({
  name: 'stripe_usage_sync_failures_total',
  help: 'Total number of failed Stripe usage sync operations',
  labelNames: ['org_id', 'reason'] as const,
});

// Migration Studio guardrail counters
export const migrationGuardrailPausesTotal = new Counter({
  name: 'migration_guardrail_pauses_total',
  help: 'Total number of experiment auto-pauses triggered by guardrails',
  labelNames: ['reason'] as const,
});

export const migrationKillsTotal = new Counter({
  name: 'migration_kills_total',
  help: 'Total number of experiment kill switches triggered by severe violations',
  labelNames: ['reason'] as const,
});

// Authentication attempt counter
export const authAttemptsTotal = new Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication/login attempts',
  labelNames: ['outcome'] as const, // outcome: success | failure | twofa_required
});

// 2FA events counter
export const twofaEventsTotal = new Counter({
  name: 'twofa_events_total',
  help: 'Total number of 2FA events',
  labelNames: ['event', 'outcome'] as const, // event: enroll|verify|login2fa|regen|disable
});
