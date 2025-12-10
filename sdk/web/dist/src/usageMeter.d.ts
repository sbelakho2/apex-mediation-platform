/**
 * @file Usage Meter
 * @description Track and report billable usage events for ad SDK
 * @module @rivalapex/web-sdk
 */
/**
 * Types of billable usage events
 */
export declare enum UsageEventType {
    AD_REQUEST = "ad_request",
    AD_IMPRESSION = "ad_impression",
    AD_CLICK = "ad_click",
    AD_VIDEO_START = "ad_video_start",
    AD_VIDEO_COMPLETE = "ad_video_complete",
    AD_REVENUE = "ad_revenue",
    API_CALL = "api_call",
    CACHE_HIT = "cache_hit",
    CACHE_MISS = "cache_miss",
    ERROR = "error"
}
/**
 * A single usage event
 */
export interface UsageEvent {
    type: UsageEventType;
    timestamp: number;
    placementId?: string;
    adapterId?: string;
    adFormat?: string;
    revenueAmount?: number;
    metadata?: Record<string, unknown>;
}
/**
 * Aggregated usage metrics
 */
export interface UsageMetrics {
    adRequests: number;
    adImpressions: number;
    adClicks: number;
    videoStarts: number;
    videoCompletes: number;
    totalRevenue: number;
    apiCalls: number;
    cacheHits: number;
    cacheMisses: number;
    errors: number;
    periodStart: number;
    periodEnd: number;
}
/**
 * Breakdown by dimension
 */
export interface UsageBreakdown {
    byPlacement: Map<string, UsageMetrics>;
    byAdapter: Map<string, UsageMetrics>;
    byAdFormat: Map<string, UsageMetrics>;
}
/**
 * Metering configuration
 */
export interface MeteringConfig {
    flushIntervalMs?: number;
    maxEventsBeforeFlush?: number;
    enableLocalStorage?: boolean;
    enableRemoteReporting?: boolean;
    samplingRate?: number;
    reportEndpoint?: string;
}
/**
 * Reporter interface for sending metrics
 */
export interface MeteringReporter {
    report(metrics: UsageMetrics, breakdown: UsageBreakdown): Promise<boolean>;
}
/**
 * Usage meter for tracking billable events
 */
export declare class UsageMeter {
    private config;
    private reporter?;
    private globalMetrics;
    private placementMetrics;
    private adapterMetrics;
    private formatMetrics;
    private pendingEvents;
    private periodStart;
    private flushTimer;
    private isRunning;
    constructor(config?: MeteringConfig, reporter?: MeteringReporter);
    /**
     * Start the metering service
     */
    start(): void;
    /**
     * Stop the metering service
     */
    stop(): void;
    /**
     * Record a usage event
     */
    record(event: UsageEvent): void;
    private getOrCreateMetrics;
    private updateMetrics;
    recordRequest(placementId: string, adapterId?: string, adFormat?: string): void;
    recordImpression(placementId: string, adapterId: string, adFormat?: string): void;
    recordClick(placementId: string, adapterId: string, adFormat?: string): void;
    recordRevenue(placementId: string, adapterId: string, amount: number): void;
    recordVideoStart(placementId: string, adapterId: string): void;
    recordVideoComplete(placementId: string, adapterId: string): void;
    recordCacheHit(placementId?: string): void;
    recordCacheMiss(placementId?: string): void;
    recordError(placementId?: string, adapterId?: string): void;
    /**
     * Get current metrics snapshot
     */
    getMetrics(): UsageMetrics;
    /**
     * Get breakdown by dimensions
     */
    getBreakdown(): UsageBreakdown;
    /**
     * Get click-through rate
     */
    getCTR(): number;
    /**
     * Get fill rate
     */
    getFillRate(): number;
    /**
     * Get video completion rate
     */
    getVideoCompletionRate(): number;
    /**
     * Get cache hit rate
     */
    getCacheHitRate(): number;
    /**
     * Get effective CPM
     */
    getEffectiveCPM(): number;
    /**
     * Flush metrics to reporter
     */
    flush(): Promise<boolean>;
    /**
     * Reset all counters
     */
    reset(): void;
    /**
     * Export metrics as JSON
     */
    exportAsJSON(): string;
    /**
     * Get pending events count
     */
    getPendingEventsCount(): number;
}
/**
 * Builder for UsageMeter
 */
export declare class UsageMeterBuilder {
    private config;
    private reporter?;
    withConfig(config: MeteringConfig): this;
    withReporter(reporter: MeteringReporter): this;
    withFlushInterval(ms: number): this;
    withSamplingRate(rate: number): this;
    withReportEndpoint(endpoint: string): this;
    enableLocalStorage(enabled: boolean): this;
    enableRemoteReporting(enabled: boolean): this;
    build(): UsageMeter;
}
