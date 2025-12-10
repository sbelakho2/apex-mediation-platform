/**
 * AdCacheTTL - Computes ad cache TTL based on refresh interval.
 *
 * The TTL is calculated as 2× the refresh interval, capped at 60 minutes.
 * This ensures ads remain cached long enough for the next refresh cycle
 * while preventing stale ads from lingering too long.
 */
/** Maximum TTL in milliseconds (60 minutes) */
export declare const MAX_TTL_MS: number;
/** Maximum TTL in seconds (60 minutes) */
export declare const MAX_TTL_SECONDS: number;
/** Default refresh interval in milliseconds if none specified */
export declare const DEFAULT_REFRESH_INTERVAL_MS: number;
/** Minimum TTL in milliseconds (30 seconds) */
export declare const MIN_TTL_MS: number;
/**
 * Cache metadata for an ad entry.
 */
export interface AdCacheMetadata {
    /** Timestamp when the ad was cached (monotonic if available, Date.now otherwise) */
    cachedAtMs: number;
    /** TTL in milliseconds */
    ttlMs: number;
    /** Refresh interval in milliseconds */
    refreshIntervalMs: number;
    /** When this entry expires */
    expiresAtMs: number;
}
/**
 * Calculates the cache TTL based on the refresh interval.
 *
 * @param refreshIntervalMs - The ad refresh interval in milliseconds
 * @returns The TTL in milliseconds (2× refreshInterval, capped at 60 minutes)
 */
export declare function calculateTTLMs(refreshIntervalMs: number): number;
/**
 * Calculates the cache TTL based on the refresh interval in seconds.
 *
 * @param refreshIntervalSeconds - The ad refresh interval in seconds
 * @returns The TTL in seconds (2× refreshInterval, capped at 60 minutes)
 */
export declare function calculateTTLSeconds(refreshIntervalSeconds: number): number;
/**
 * Calculates the effective TTL, respecting any server-provided TTL.
 *
 * If the server provides a TTL, we use the minimum of:
 * - Server-provided TTL
 * - Calculated TTL (2× refreshInterval)
 * - Maximum TTL (60 minutes)
 *
 * @param refreshIntervalMs - The ad refresh interval in milliseconds
 * @param serverTTLSeconds - The TTL provided by the server (optional)
 * @returns The effective TTL in milliseconds
 */
export declare function calculateEffectiveTTLMs(refreshIntervalMs: number, serverTTLSeconds?: number): number;
/**
 * Checks if an ad has expired based on its cache timestamp and TTL.
 *
 * @param cachedAtMs - The timestamp when the ad was cached
 * @param ttlMs - The TTL in milliseconds
 * @param nowMs - The current time
 * @returns True if the ad has expired
 */
export declare function isExpired(cachedAtMs: number, ttlMs: number, nowMs: number): boolean;
/**
 * Gets the remaining TTL for a cached ad.
 *
 * @param cachedAtMs - The timestamp when the ad was cached
 * @param ttlMs - The TTL in milliseconds
 * @param nowMs - The current time
 * @returns The remaining TTL in milliseconds (0 if expired)
 */
export declare function remainingTTLMs(cachedAtMs: number, ttlMs: number, nowMs: number): number;
/**
 * Determines if an ad should be pre-fetched based on remaining TTL.
 * Pre-fetch should occur when remaining TTL is less than the refresh interval.
 *
 * @param cachedAtMs - The timestamp when the ad was cached
 * @param ttlMs - The TTL in milliseconds
 * @param refreshIntervalMs - The refresh interval in milliseconds
 * @param nowMs - The current time
 * @returns True if a pre-fetch should be triggered
 */
export declare function shouldPrefetch(cachedAtMs: number, ttlMs: number, refreshIntervalMs: number, nowMs: number): boolean;
/**
 * Creates cache metadata for an ad entry.
 *
 * @param refreshIntervalMs - The ad refresh interval in milliseconds
 * @param serverTTLSeconds - The TTL provided by the server (optional)
 * @param nowMs - The current timestamp (defaults to Date.now())
 * @returns The cache metadata
 */
export declare function createCacheMetadata(refreshIntervalMs: number, serverTTLSeconds?: number, nowMs?: number): AdCacheMetadata;
/**
 * Helper class for working with cached ads.
 */
export declare class AdCacheEntry {
    private readonly metadata;
    constructor(refreshIntervalMs: number, serverTTLSeconds?: number, nowMs?: number);
    /**
     * Gets the cache metadata.
     */
    getMetadata(): AdCacheMetadata;
    /**
     * Checks if this entry has expired.
     */
    isExpired(nowMs?: number): boolean;
    /**
     * Gets the remaining TTL in milliseconds.
     */
    remainingMs(nowMs?: number): number;
    /**
     * Checks if this ad should be pre-fetched.
     */
    shouldPrefetch(nowMs?: number): boolean;
}
declare const _default: {
    MAX_TTL_MS: number;
    MAX_TTL_SECONDS: number;
    DEFAULT_REFRESH_INTERVAL_MS: number;
    MIN_TTL_MS: number;
    calculateTTLMs: typeof calculateTTLMs;
    calculateTTLSeconds: typeof calculateTTLSeconds;
    calculateEffectiveTTLMs: typeof calculateEffectiveTTLMs;
    isExpired: typeof isExpired;
    remainingTTLMs: typeof remainingTTLMs;
    shouldPrefetch: typeof shouldPrefetch;
    createCacheMetadata: typeof createCacheMetadata;
    AdCacheEntry: typeof AdCacheEntry;
};
export default _default;
