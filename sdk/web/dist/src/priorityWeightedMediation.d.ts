/**
 * PriorityWeightedMediation - Intelligent ad source selection
 *
 * Implements intelligent ad source selection based on:
 * - Configured priority (lower = higher priority)
 * - Weighted random selection within same priority tier
 * - Performance-based weight adjustments
 * - Fill rate optimization
 */
/**
 * Ad source with priority and weight configuration
 */
export interface WeightedAdSource {
    id: string;
    priority: number;
    weight: number;
    timeout: number;
    enabled: boolean;
    minBid: number;
    metadata: Record<string, string>;
}
/**
 * Result of loading an ad from a source
 */
export type AdLoadResult = {
    type: 'success';
    ad: unknown;
    sourceId: string;
    latencyMs: number;
    bid: number;
} | {
    type: 'noFill';
    sourceId: string;
    reason: string;
} | {
    type: 'error';
    sourceId: string;
    error: Error;
} | {
    type: 'timeout';
    sourceId: string;
};
/**
 * Statistics for a source
 */
export interface SourcePerformance {
    sourceId: string;
    totalAttempts: number;
    successCount: number;
    noFillCount: number;
    errorCount: number;
    timeoutCount: number;
    averageLatencyMs: number;
    fillRate: number;
    averageBid: number;
    effectiveWeight: number;
}
/**
 * Configuration for priority-weighted mediation
 */
export interface PriorityWeightedConfig {
    usePerformanceWeighting: boolean;
    performanceWindowMs: number;
    minSampleSize: number;
    weightDecayFactor: number;
    maxConcurrentRequests: number;
    bidFloorEnabled: boolean;
    adaptiveTimeoutsEnabled: boolean;
}
/**
 * Default configuration
 */
export declare const DEFAULT_CONFIG: PriorityWeightedConfig;
/**
 * Ad loader function type
 */
export type AdLoader = (source: WeightedAdSource, signal?: AbortSignal) => Promise<AdLoadResult>;
/**
 * Priority-weighted mediation manager
 */
export declare class PriorityWeightedMediation {
    private config;
    private sourceStats;
    constructor(config?: Partial<PriorityWeightedConfig>);
    /**
     * Execute mediation with priority-weighted selection
     */
    execute(sources: WeightedAdSource[], loader: AdLoader, abortSignal?: AbortSignal): Promise<AdLoadResult>;
    /**
     * Get performance statistics for all sources
     */
    getPerformanceStats(): SourcePerformance[];
    /**
     * Get performance for a specific source
     */
    getSourcePerformance(sourceId: string): SourcePerformance | null;
    /**
     * Reset statistics for a source
     */
    resetStats(sourceId: string): void;
    /**
     * Reset all statistics
     */
    resetAllStats(): void;
    /**
     * Update configuration
     */
    updateConfiguration(config: Partial<PriorityWeightedConfig>): void;
    /**
     * Get current configuration
     */
    getConfiguration(): PriorityWeightedConfig;
    private groupByPriority;
    private executePriorityGroup;
    private selectByWeight;
    private calculateEffectiveWeight;
    private executeWithTimeout;
    private calculateAdaptiveTimeout;
    private recordResult;
}
/**
 * Builder for WeightedAdSource
 */
export declare class WeightedAdSourceBuilder {
    private source;
    id(id: string): this;
    priority(priority: number): this;
    weight(weight: number): this;
    timeout(timeout: number): this;
    enabled(enabled: boolean): this;
    minBid(minBid: number): this;
    metadata(key: string, value: string): this;
    build(): WeightedAdSource;
}
/**
 * Helper function to create a weighted ad source
 */
export declare function createWeightedAdSource(id: string, priority: number, options?: Partial<Omit<WeightedAdSource, 'id' | 'priority'>>): WeightedAdSource;
