# ADR‑SB‑01 — State Externalization (Queues, Breakers, Registries)

Status: Accepted (2025‑11‑18)

Context
- Batch 2 replaces in‑memory/instance‑local state with durable/shared backends to support horizontal scale and resilience.
- Key surfaces: analytics ingestion buffering, Redis‑backed circuit breakers, DB‑backed adapter registry with hot reload.

Decision
- Use Redis list‑backed queue (minimal dependency) for analytics ingestion by default; keep BullMQ/Kafka as future options behind flags.
- Implement Redis‑backed circuit breakers with env‑tunable thresholds, windows, cool‑downs, and probe throttling.
- Persist adapter configs in Postgres (`adapter_configs`) and cache with TTL; hot reload via Redis pub/sub invalidation channel `adapter-configs:invalidate` plus polling fallback.

Flags
- `USE_REDIS_STREAMS_FOR_ANALYTICS` (default off): enable producers/worker path.
- `REDIS_BREAKERS_ENABLED` (default off): enable breaker checks in RTB orchestrator.
- `ADAPTER_REGISTRY_REFRESH_SEC` (default 60): TTL cache refresh interval.

Alternatives considered
- BullMQ (Redis Streams) and Kafka for analytics: more features/visibility but heavier ops; list‑backed queue is sufficient to decouple producers and adds minimal footprint.
- Local adapter JSON config: simpler but requires restarts and risks drift in multi‑node deployments.

Consequences
- Strict dependency handling: producers fail‑open if Redis unavailable; workers perform retries with backoff and drop irrecoverable batches to DLQ (future improvement: alerting).
- Registry updates propagate quickly via pub/sub; polling remains a guardrail.

Validation
- `/analytics/buffer-stats` exposes queue depth and DLQ counts.
- `/api/v1/rtb/status` includes safe breaker summaries per adapter when breakers are enabled.
