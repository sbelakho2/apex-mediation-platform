/**
 * FallbackWaterfall - Implements a waterfall mediation strategy for ad loading.
 *
 * When one ad source fails, it automatically falls back to the next source
 * in the waterfall. This ensures maximum fill rate by trying multiple
 * demand partners in priority order.
 */
/** Default timeout for source loading (ms) */
export declare const DEFAULT_TIMEOUT_MS = 5000;
/** Result type for attempts */
export type AttemptResultType = 'success' | 'noFill' | 'error' | 'timeout' | 'skipped';
/** Result of attempting to load from a source */
export type WaterfallResult<T> = {
    type: 'success';
    data: T;
} | {
    type: 'noFill';
    reason: string;
} | {
    type: 'error';
    error: Error;
} | {
    type: 'timeout';
};
/** Represents an ad source in the waterfall */
export interface WaterfallSource<T> {
    readonly id: string;
    readonly priority: number;
    readonly timeoutMs: number;
    readonly loader: (signal: AbortSignal) => Promise<WaterfallResult<T>>;
}
/** Details about each attempt in the waterfall */
export interface AttemptDetail {
    readonly sourceId: string;
    readonly priority: number;
    readonly durationMs: number;
    readonly result: AttemptResultType;
}
/** Waterfall execution result with metadata */
export interface ExecutionResult<T> {
    readonly result: WaterfallResult<T>;
    readonly sourceId: string;
    readonly attemptsCount: number;
    readonly totalDurationMs: number;
    readonly attemptDetails: readonly AttemptDetail[];
}
/** Performance statistics for a source */
export interface SourceStats {
    successCount: number;
    failureCount: number;
    timeoutCount: number;
    noFillCount: number;
    totalLatencyMs: number;
    readonly totalAttempts: number;
    readonly successRate: number;
    readonly averageLatencyMs: number;
}
/** FallbackWaterfall class for managing waterfall execution */
export declare class FallbackWaterfall<T> {
    private readonly defaultTimeoutMs;
    private readonly sourceStats;
    constructor(defaultTimeoutMs?: number);
    /**
     * Executes the waterfall, trying each source in priority order until
     * one succeeds or all sources are exhausted.
     */
    execute(sources: readonly WaterfallSource<T>[], signal?: AbortSignal): Promise<ExecutionResult<T>>;
    /**
     * Executes waterfall with parallel preloading of lower-priority sources.
     */
    executeWithParallelPreload(sources: readonly WaterfallSource<T>[], preloadCount?: number, signal?: AbortSignal): Promise<ExecutionResult<T>>;
    /**
     * Gets statistics for a specific source.
     */
    getStats(sourceId: string): SourceStats | undefined;
    /**
     * Gets statistics for all sources.
     */
    getAllStats(): Map<string, SourceStats>;
    /**
     * Clears all recorded statistics.
     */
    clearStats(): void;
    /**
     * Creates a source with the given parameters.
     */
    createSource(id: string, priority: number, loader: (signal: AbortSignal) => Promise<WaterfallResult<T>>, timeoutMs?: number): WaterfallSource<T>;
    private executeWithTimeout;
    private resultToType;
    private recordStats;
}
/** Creates a new FallbackWaterfall instance */
export declare function createWaterfall<T>(defaultTimeoutMs?: number): FallbackWaterfall<T>;
/** Helper to create a success result */
export declare function success<T>(data: T): WaterfallResult<T>;
/** Helper to create a no-fill result */
export declare function noFill<T>(reason?: string): WaterfallResult<T>;
/** Helper to create an error result */
export declare function error<T>(err: Error): WaterfallResult<T>;
/** Helper to create a timeout result */
export declare function timeout<T>(): WaterfallResult<T>;
