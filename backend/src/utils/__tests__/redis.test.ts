/**
 * Redis Cache Tests
 * 
 * Unit tests for Redis client and caching utilities
 * Tests will skip gracefully if Redis is not available
 */

import { redis, cacheKeys, cacheTTL } from '../../utils/redis';

describe('Redis Client', () => {
  // Tests run without connecting - individual tests will check availability
  
  afterAll(async () => {
    // Cleanup and disconnect
    if (redis.isReady()) {
      try {
        await redis.flushAll();
        await redis.disconnect();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }, 10000);

  beforeEach(async () => {
    // Clear all keys before each test
    if (redis.isReady()) {
      await redis.flushAll();
    }
  });

  describe('Connection', () => {
    it('should work without Redis (graceful degradation)', () => {
      // System should work even if Redis is not available
      const isReady = redis.isReady();
      expect(typeof isReady).toBe('boolean');
    });
  });

  describe('Basic Operations', () => {
    it('should set and get a value or skip if not connected', async () => {
      if (!redis.isReady()) {
        console.log('Skipping: Redis not available');
        return; // Skip if Redis not available
      }

      const key = 'test:key';
      const value = { foo: 'bar', count: 42 };

      await redis.set(key, value);
      const retrieved = await redis.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent key or skip if not connected', async () => {
      if (!redis.isReady()) {
        console.log('Skipping: Redis not available');
        return;
      }

      const result = await redis.get('nonexistent:key');
      expect(result).toBeNull();
    });

    it('should delete a key or skip if not connected', async () => {
      if (!redis.isReady()) {
        console.log('Skipping: Redis not available');
        return;
      }

      const key = 'test:delete';
      await redis.set(key, 'value');
      
      expect(await redis.exists(key)).toBe(true);
      
      await redis.del(key);
      
      expect(await redis.exists(key)).toBe(false);
    });

    it('should set TTL on a key or skip if not connected', async () => {
      if (!redis.isReady()) {
        console.log('Skipping: Redis not available');
        return;
      }

      const key = 'test:ttl';
      await redis.set(key, 'value', 1); // 1 second TTL

      expect(await redis.exists(key)).toBe(true);

      // Wait for key to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(await redis.exists(key)).toBe(false);
    });
  });

  describe('Pattern Operations', () => {
    it('should delete keys matching a pattern or skip if not connected', async () => {
      if (!redis.isReady()) {
        console.log('Skipping: Redis not available');
        return;
      }

      await redis.set('analytics:pub1:data1', 'value1');
      await redis.set('analytics:pub1:data2', 'value2');
      await redis.set('analytics:pub2:data1', 'value3');
      await redis.set('other:key', 'value4');

      const deleted = await redis.delPattern('analytics:pub1:*');

      expect(deleted).toBe(2);
      expect(await redis.exists('analytics:pub1:data1')).toBe(false);
      expect(await redis.exists('analytics:pub1:data2')).toBe(false);
      expect(await redis.exists('analytics:pub2:data1')).toBe(true);
      expect(await redis.exists('other:key')).toBe(true);
    });
  });

  describe('Increment Operation', () => {
    it('should increment a numeric value or skip if not connected', async () => {
      if (!redis.isReady()) {
        console.log('Skipping: Redis not available');
        return;
      }

      const key = 'test:counter';

      const count1 = await redis.incr(key);
      expect(count1).toBe(1);

      const count2 = await redis.incr(key);
      expect(count2).toBe(2);

      const count3 = await redis.incr(key);
      expect(count3).toBe(3);
    });
  });

  describe('Get or Set Pattern', () => {
    it('should fetch from cache on hit or skip if not connected', async () => {
      if (!redis.isReady()) {
        console.log('Skipping: Redis not available');
        return;
      }

      const key = 'test:getOrSet';
      const cachedValue = { data: 'cached' };
      
      await redis.set(key, cachedValue);

      let fetchCalled = false;
      const fetchFn = jest.fn(async () => {
        fetchCalled = true;
        return { data: 'fresh' };
      });

      const result = await redis.getOrSet(key, fetchFn);

      expect(result).toEqual(cachedValue);
      expect(fetchCalled).toBe(false);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should fetch and cache on miss or skip if not connected', async () => {
      if (!redis.isReady()) {
        console.log('Skipping: Redis not available');
        return;
      }

      const key = 'test:getOrSetMiss';
      const freshValue = { data: 'fresh' };
      
      const fetchFn = jest.fn(async () => freshValue);

      const result = await redis.getOrSet(key, fetchFn, 60);

      expect(result).toEqual(freshValue);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Verify it's cached
      const cached = await redis.get(key);
      expect(cached).toEqual(freshValue);
    });
  });

  describe('Cache Keys', () => {
    it('should generate consistent analytics cache keys', () => {
      const pubId = 'pub-123';
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';

      const key1 = cacheKeys.analytics.revenue(pubId, startDate, endDate);
      const key2 = cacheKeys.analytics.revenue(pubId, startDate, endDate);

      expect(key1).toBe(key2);
      expect(key1).toContain('analytics:revenue');
      expect(key1).toContain(pubId);
      expect(key1).toContain(startDate);
    });

    it('should generate consistent A/B testing cache keys', () => {
      const experimentId = 'exp-456';

      const key1 = cacheKeys.abTesting.experiment(experimentId);
      const key2 = cacheKeys.abTesting.experiment(experimentId);

      expect(key1).toBe(key2);
      expect(key1).toContain('ab:experiment');
      expect(key1).toContain(experimentId);
    });
  });

  describe('Cache TTL Constants', () => {
    it('should have appropriate TTL values', () => {
      expect(cacheTTL.short).toBe(60);
      expect(cacheTTL.medium).toBe(300);
      expect(cacheTTL.long).toBe(1800);
      expect(cacheTTL.veryLong).toBe(3600);
      expect(cacheTTL.day).toBe(86400);
    });
  });
});
