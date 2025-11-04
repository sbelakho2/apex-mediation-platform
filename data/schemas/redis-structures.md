# Redis Cache Structures Documentation

## Overview
Redis is used for high-performance caching, rate limiting, and real-time data structures.

## Key Structures

### 1. SDK Configurations
**Pattern:** `sdk:config:{publisher_id}:{version}`
- **Type:** String (JSON)
- **TTL:** 24 hours
- **Purpose:** Cached SDK configuration with signature
- **Example:**
```json
{
  "version": 123,
  "placements": [...],
  "adapters": [...],
  "fraud_rules": {...},
  "signature": "ed25519_signature_here"
}
```

### 2. Active SDK Config Version
**Pattern:** `sdk:active:{publisher_id}`
- **Type:** String
- **TTL:** None (persistent)
- **Purpose:** Current active config version number
- **Example:** `"123"`

### 3. Rate Limiting
**Pattern:** `ratelimit:{publisher_id}:{endpoint}:{window}`
- **Type:** String (counter)
- **TTL:** Window duration (e.g., 60s, 3600s)
- **Purpose:** API rate limiting per publisher/endpoint
- **Commands:**
```redis
INCR ratelimit:pub_123:ad_request:60
EXPIRE ratelimit:pub_123:ad_request:60 60
```

### 4. Session Cache
**Pattern:** `session:{session_id}`
- **Type:** Hash
- **TTL:** 30 minutes
- **Purpose:** SDK session state
- **Fields:**
  - `device_id`
  - `publisher_id`
  - `placement_id`
  - `ad_count`
  - `last_ad_time`
  - `fraud_score`

### 5. Device Fingerprints
**Pattern:** `device:{device_id}:fingerprint`
- **Type:** Hash
- **TTL:** 30 days
- **Purpose:** Fraud detection device tracking
- **Fields:**
  - `first_seen`
  - `last_seen`
  - `impression_count`
  - `fraud_flags`
  - `risk_score`

### 6. Bid Cache
**Pattern:** `bid:{auction_id}`
- **Type:** Hash
- **TTL:** 5 minutes
- **Purpose:** Auction bid responses
- **Fields:**
  - `network_name: {bid_cents}:{response_time_ms}`

### 7. Adapter Health
**Pattern:** `adapter:health:{network}:{publisher_id}`
- **Type:** String (JSON)
- **TTL:** 5 minutes
- **Purpose:** Circuit breaker state
- **Example:**
```json
{
  "status": "healthy|degraded|circuit_open",
  "error_count": 5,
  "last_error": "2024-11-02T10:30:00Z",
  "success_rate": 0.95
}
```

### 8. Real-time Metrics
**Pattern:** `metrics:{publisher_id}:{metric_name}:{timestamp_bucket}`
- **Type:** String (counter)
- **TTL:** 1 hour
- **Purpose:** Real-time metric aggregation
- **Examples:**
  - `metrics:pub_123:impressions:2024110215` (hourly bucket)
  - `metrics:pub_123:revenue_cents:2024110215`

### 9. Fraud IP Blocklist
**Pattern:** `fraud:blocklist:ip`
- **Type:** Set
- **TTL:** None (managed)
- **Purpose:** Known fraudulent IP hashes
- **Commands:**
```redis
SADD fraud:blocklist:ip "hash1" "hash2"
SISMEMBER fraud:blocklist:ip "hash_to_check"
```

### 10. Payout Locks
**Pattern:** `payout:lock:{publisher_id}`
- **Type:** String
- **TTL:** 5 minutes
- **Purpose:** Prevent concurrent payout processing
- **Commands:**
```redis
SET payout:lock:pub_123 "worker_id" NX EX 300
```

### 11. Dashboard Cache
**Pattern:** `dashboard:{publisher_id}:{date_range}`
- **Type:** String (JSON)
- **TTL:** 5 minutes
- **Purpose:** Dashboard query results cache
- **Example:**
```json
{
  "revenue": 12345.67,
  "impressions": 1000000,
  "ecpm": 12.35,
  "fill_rate": 89.5
}
```

### 12. Recent Fraud Alerts
**Pattern:** `fraud:alerts:{publisher_id}`
- **Type:** Sorted Set
- **Score:** Timestamp
- **TTL:** 24 hours
- **Purpose:** Quick access to recent alerts
- **Commands:**
```redis
ZADD fraud:alerts:pub_123 1699000000 "alert_json"
ZRANGE fraud:alerts:pub_123 0 -1 WITHSCORES
```

## Cache Patterns

### Cache-Aside Pattern
```python
def get_sdk_config(publisher_id, version):
    cache_key = f"sdk:config:{publisher_id}:{version}"
    
    # Try cache first
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    
    # Cache miss - fetch from DB
    config = db.get_sdk_config(publisher_id, version)
    
    # Store in cache
    redis.setex(cache_key, 86400, json.dumps(config))
    
    return config
```

### Write-Through Pattern
```python
def update_sdk_config(publisher_id, version, config):
    # Update database
    db.save_sdk_config(publisher_id, version, config)
    
    # Update cache
    cache_key = f"sdk:config:{publisher_id}:{version}"
    redis.setex(cache_key, 86400, json.dumps(config))
    
    # Update active version pointer
    redis.set(f"sdk:active:{publisher_id}", version)
```

### Rate Limiting Pattern
```python
def check_rate_limit(publisher_id, endpoint, limit, window):
    key = f"ratelimit:{publisher_id}:{endpoint}:{window}"
    
    current = redis.incr(key)
    
    if current == 1:
        redis.expire(key, window)
    
    return current <= limit
```

### Circuit Breaker Pattern
```python
def check_adapter_health(network, publisher_id):
    key = f"adapter:health:{network}:{publisher_id}"
    health = redis.get(key)
    
    if not health:
        return "healthy"
    
    state = json.loads(health)
    
    if state["status"] == "circuit_open":
        # Check if cooldown period passed
        last_error = datetime.fromisoformat(state["last_error"])
        if datetime.now() - last_error > timedelta(minutes=5):
            return "healthy"  # Allow retry
        return "circuit_open"
    
    return state["status"]
```

## Monitoring

### Key Metrics to Track
- Cache hit rate per key pattern
- Memory usage by key pattern
- Eviction rate
- Command latency (P50, P95, P99)
- Connection pool utilization

### Redis INFO Commands
```bash
# Memory usage
redis-cli INFO memory

# Key statistics
redis-cli --bigkeys

# Slow queries
redis-cli SLOWLOG GET 10
```

## Maintenance

### Key Expiration Strategy
- Short TTL (< 5min): Real-time data, rate limits
- Medium TTL (5min - 1hr): Dashboard caches, metrics
- Long TTL (1hr - 24hr): SDK configs, device fingerprints
- No expiry: Active config pointers, blocklists (manual management)

### Memory Management
- Max memory policy: `allkeys-lru`
- Max memory: Configure based on workload (start with 4GB)
- Monitor memory usage and adjust TTLs accordingly

### Backup Strategy
- Redis persistence: RDB + AOF
- Snapshot frequency: Every 5 minutes if data changed
- AOF fsync: Every second (appendfsync everysec)
