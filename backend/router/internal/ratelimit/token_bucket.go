package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	log "github.com/sirupsen/logrus"
)

// TokenBucket implements token bucket rate limiting
type TokenBucket struct {
	redis *redis.Client
}

// NewTokenBucket creates a new token bucket rate limiter
func NewTokenBucket(redisClient *redis.Client) *TokenBucket {
	return &TokenBucket{
		redis: redisClient,
	}
}

// Allow checks if request is allowed under rate limit
func (tb *TokenBucket) Allow(ctx context.Context, key string, limit int64, window time.Duration) (bool, error) {
	now := time.Now().Unix()
	windowStart := now - int64(window.Seconds())

	// Use Redis sorted set for sliding window
	pipe := tb.redis.Pipeline()

	// Remove old entries
	pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart))

	// Count current requests
	pipe.ZCard(ctx, key)

	// Add current request
	pipe.ZAdd(ctx, key, redis.Z{Score: float64(now), Member: fmt.Sprintf("%d", now)})

	// Set expiry
	pipe.Expire(ctx, key, window)

	results, err := pipe.Exec(ctx)
	if err != nil {
		return false, err
	}

	// Get count from pipeline results
	count := results[1].(*redis.IntCmd).Val()

	allowed := count < limit

	if !allowed {
		log.WithFields(log.Fields{
			"key":   key,
			"count": count,
			"limit": limit,
		}).Warn("Rate limit exceeded")
	}

	return allowed, nil
}

// AllowPublisher checks rate limit for a publisher
func (tb *TokenBucket) AllowPublisher(ctx context.Context, publisherID string, limit int64, window time.Duration) (bool, error) {
	key := fmt.Sprintf("ratelimit:publisher:%s", publisherID)
	return tb.Allow(ctx, key, limit, window)
}

// AllowAdapter checks rate limit for an adapter
func (tb *TokenBucket) AllowAdapter(ctx context.Context, adapterID string, limit int64, window time.Duration) (bool, error) {
	key := fmt.Sprintf("ratelimit:adapter:%s", adapterID)
	return tb.Allow(ctx, key, limit, window)
}

// AllowIP checks rate limit for an IP address
func (tb *TokenBucket) AllowIP(ctx context.Context, ip string, limit int64, window time.Duration) (bool, error) {
	key := fmt.Sprintf("ratelimit:ip:%s", ip)
	return tb.Allow(ctx, key, limit, window)
}

// GetCurrentCount gets current request count in window
func (tb *TokenBucket) GetCurrentCount(ctx context.Context, key string, window time.Duration) (int64, error) {
	now := time.Now().Unix()
	windowStart := now - int64(window.Seconds())

	return tb.redis.ZCount(ctx, key, fmt.Sprintf("%d", windowStart), fmt.Sprintf("%d", now)).Result()
}

// GetRemainingQuota gets remaining quota in current window
func (tb *TokenBucket) GetRemainingQuota(ctx context.Context, key string, limit int64, window time.Duration) (int64, error) {
	count, err := tb.GetCurrentCount(ctx, key, window)
	if err != nil {
		return 0, err
	}

	remaining := limit - count
	if remaining < 0 {
		remaining = 0
	}

	return remaining, nil
}

// Reset resets rate limit for a key
func (tb *TokenBucket) Reset(ctx context.Context, key string) error {
	return tb.redis.Del(ctx, key).Err()
}
