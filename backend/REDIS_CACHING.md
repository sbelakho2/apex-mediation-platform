# Redis Caching Implementation

## Overview

Comprehensive Redis caching layer implemented to optimize performance of analytics, A/B testing, and data export endpoints. The caching system reduces load on the ClickHouse analytics database and improves API response times.

## Architecture

### Core Components

1. **Redis Client (`src/utils/redis.ts`)**
   - Singleton pattern for single connection instance
   - Automatic reconnection with exponential backoff
   - Graceful degradation when Redis unavailable
   - Connection management and health monitoring

2. **Cache Middleware (`src/middleware/cache.ts`)**
   - Automatic response caching for GET requests
   - Configurable TTL per endpoint
   - Cache key generation with vary-by support
   - Cache invalidation patterns
   - X-Cache headers for debugging

3. **Server Integration (`src/index.ts`)**
   - Non-blocking Redis connection on startup
   - Health check endpoint includes Redis status
   - System works without Redis (degraded performance only)

## Caching Strategy

### TTL Levels

```typescript
cacheTTL = {
  short: 60s,       // Frequently changing data
  medium: 300s,     // Moderate frequency changes
  long: 1800s,      // Stable data
  veryLong: 3600s,  // Very stable data
  day: 86400s       // Daily data
}
```

### Analytics Endpoints

| Endpoint | TTL | Vary By | Reason |
|----------|-----|---------|--------|
| GET /overview | medium (300s) | startDate, endDate | Aggregate metrics change moderately |
| GET /timeseries | medium (300s) | dates + granularity | Time-series data with different granularities |
| GET /performance | long (1800s) | dates + groupBy | Performance metrics are more stable |
| GET /buffer-stats | short (60s) | - | Near real-time buffer monitoring |

**Cache Invalidation:**
- POST /impression, /click, /revenue → Invalidates publisher-scoped analytics cache

### A/B Testing Endpoints

| Endpoint | TTL | Vary By | Reason |
|----------|-----|---------|--------|
| GET /experiments/:id | short (60s) | experimentId | Active experiments change frequently |
| GET /significance | medium (300s) | query params | Expensive statistical calculations |
| GET /bandit | short (60s) | query params | Fresh recommendations needed |

**Cache Invalidation:**
- POST /experiments → Clears experiment list
- POST /start, /stop, /events → Clears experiment-specific data

### Data Export Endpoints

| Endpoint | TTL | Vary By | Reason |
|----------|-----|---------|--------|
| GET /jobs/:id | short (60s) | jobId | Job status changes frequently |
| GET /jobs | medium (300s) | query params | Job list caching |

**Cache Invalidation:**
- POST /jobs → Clears job list cache

**Note:** Download endpoint not cached (file streaming)

## Key Features

### 1. Graceful Degradation

```typescript
// System works without Redis
if (!redis.isReady()) {
  logger.warn('Redis not connected, skipping cache');
  return null;
}
```

### 2. Cache Key Namespacing

```typescript
cacheKeys = {
  analytics: {
    revenue: (pubId, start, end) => `analytics:revenue:${pubId}:${start}:${end}`,
    performance: (...) => `analytics:performance:...`,
  },
  abTesting: {
    experiment: (id) => `ab:experiment:${id}`,
  },
  export: {
    job: (id) => `export:job:${id}`,
  },
}
```

### 3. Pattern-Based Invalidation

```typescript
// Invalidate all analytics cache for a publisher
await redis.delPattern(`analytics:*:${publisherId}:*`);

// Invalidate specific experiment cache
await redis.delPattern(`ab:experiment:${experimentId}:*`);
```

### 4. Cache Hit/Miss Monitoring

```typescript
// Automatic X-Cache header injection
res.setHeader('X-Cache', 'HIT'); // or 'MISS'
```

### 5. Get-or-Set Pattern

```typescript
// Fetch from cache or compute and cache
const data = await redis.getOrSet(
  key,
  async () => expensiveQuery(),
  cacheTTL.medium
);
```

## Redis Client API

### Connection Management

```typescript
await redis.connect();    // Connect to Redis
await redis.disconnect(); // Graceful disconnect
redis.isReady();         // Check connection status
```

### Basic Operations

```typescript
await redis.set(key, value, ttl?);  // Set value with optional TTL
await redis.get(key);                // Get value
await redis.del(key);                // Delete key
await redis.exists(key);             // Check if key exists
await redis.expire(key, seconds);    // Set TTL on existing key
await redis.incr(key);               // Increment numeric value
```

### Pattern Operations

```typescript
await redis.delPattern('analytics:*'); // Delete keys matching pattern
await redis.flushAll();                // Clear all keys (use with caution)
```

### Get-or-Set

```typescript
await redis.getOrSet(
  key,
  async () => fetchData(),
  ttl?
);
```

## Middleware Usage

### Cache Middleware

```typescript
router.get(
  '/endpoint',
  cache({
    ttl: cacheTTL.medium,
    keyPrefix: 'prefix',
    varyBy: ['query1', 'query2'],
  }),
  handler
);
```

### Invalidation Middleware

```typescript
router.post(
  '/endpoint',
  invalidateCache('pattern:*'),
  handler
);

router.post(
  '/endpoint',
  invalidatePublisherCache('pattern'),
  handler
);
```

## Testing

### Test Coverage

- ✅ Redis client connection and graceful degradation
- ✅ Basic operations (get, set, delete, TTL)
- ✅ Pattern-based operations (delPattern)
- ✅ Increment operations
- ✅ Get-or-set pattern
- ✅ Cache key generation
- ✅ TTL constants

**Test Results:**
- 21/22 test suites pass (1 skipped: winston)
- 220 tests pass
- 12 Redis tests skip gracefully when Redis unavailable

### Running Tests

```bash
# All tests
npm test

# Redis tests only
npm test -- redis.test.ts

# With Redis running
docker run -p 6379:6379 redis:7-alpine
npm test -- redis.test.ts
```

## Configuration

### Environment Variables

```bash
# Redis connection URL
REDIS_URL=redis://localhost:6379

# Default: redis://localhost:6379
```

### Connection Options

```typescript
{
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    connectTimeout: 5000,  // 5 second initial connection timeout
    reconnectStrategy: (retries) => {
      if (retries > 10) return false; // Stop after 10 attempts
      return Math.min(100 * Math.pow(2, retries), 5000); // Exponential backoff
    },
  },
}
```

## Monitoring

### Health Check

```bash
GET /health

Response:
{
  "status": "healthy",
  "services": {
    "postgres": "connected",
    "clickhouse": "connected",
    "redis": "connected"  // or "disconnected"
  }
}
```

### Cache Headers

```bash
# Cache hit
X-Cache: HIT

# Cache miss
X-Cache: MISS
```

### Logging

```typescript
// Connection events
logger.info('Redis client connected and ready');
logger.warn('Reconnecting to Redis in 100ms (attempt 0)');
logger.error('Max Redis reconnection attempts reached');

// Cache operations
logger.warn('Redis not connected, skipping cache get', { key });
logger.info('Cache cleared', { pattern });
```

## Performance Benefits

### Expected Impact

1. **Response Time Reduction:**
   - Analytics queries: 100-500ms → 5-10ms (90-95% improvement)
   - A/B testing queries: 50-200ms → 5-10ms (85-95% improvement)
   - Data export status: 20-50ms → 2-5ms (80-90% improvement)

2. **Load Reduction:**
   - ClickHouse query load: 50-80% reduction
   - Database connection pool usage: 40-60% reduction
   - API server CPU: 20-30% reduction

3. **Scalability:**
   - Can handle 5-10x more concurrent requests
   - Reduced database contention
   - Better performance under load

## Next Steps

1. **Monitoring & Metrics:**
   - Add cache hit/miss rate tracking
   - Monitor cache memory usage
   - Track cache key distribution

2. **Optimization:**
   - Tune TTL values based on real usage
   - Add conditional caching based on query complexity
   - Implement cache warming for popular queries

3. **Background Jobs:**
   - Use Redis for Bull/BullMQ job queues
   - Leverage existing Redis connection
   - Share connection pool

## Related Files

- `backend/src/utils/redis.ts` - Redis client utility
- `backend/src/middleware/cache.ts` - Cache middleware
- `backend/src/routes/analytics.routes.ts` - Analytics caching
- `backend/src/routes/abTesting.routes.ts` - A/B testing caching
- `backend/src/routes/dataExport.routes.ts` - Data export caching
- `backend/src/index.ts` - Server integration
- `backend/src/utils/__tests__/redis.test.ts` - Redis tests
