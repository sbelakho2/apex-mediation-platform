/**
 * AdaptiveConcurrency - Adaptive task scheduling based on device capabilities.
 *
 * This class provides adaptive concurrency management for web that:
 * - Detects hardware concurrency (logical CPU cores)
 * - Limits concurrent operations appropriately
 * - Provides separate queues for different operation types
 * - Uses requestIdleCallback for low-priority work
 */
export interface AdaptiveConcurrencyConfig {
    /** Override for max background tasks */
    maxBackgroundTasks?: number;
    /** Override for max network tasks */
    maxNetworkTasks?: number;
    /** Override for max compute tasks */
    maxComputeTasks?: number;
    /** Enable debug logging */
    debug?: boolean;
}
export interface DeviceInfo {
    /** Number of logical CPU cores */
    hardwareConcurrency: number;
    /** Device memory in GB (if available) */
    deviceMemory: number | null;
    /** Whether this appears to be a low-end device */
    isLowEndDevice: boolean;
    /** User agent string */
    userAgent: string;
    /** Whether running in a worker context */
    isWorker: boolean;
}
export interface PoolConfig {
    maxConcurrency: number;
}
export interface ConcurrencyStats {
    deviceInfo: DeviceInfo;
    backgroundQueue: {
        pending: number;
        running: number;
        maxConcurrency: number;
    };
    networkQueue: {
        pending: number;
        running: number;
        maxConcurrency: number;
    };
    computeQueue: {
        pending: number;
        running: number;
        maxConcurrency: number;
    };
    totalTasksSubmitted: number;
    totalTasksCompleted: number;
}
/**
 * AdaptiveConcurrency manages task execution with adaptive limits based on device capabilities.
 */
export declare class AdaptiveConcurrency {
    private static instance;
    private readonly deviceInfo;
    private readonly config;
    private readonly backgroundQueue;
    private readonly networkQueue;
    private readonly computeQueue;
    private taskCount;
    private completedCount;
    private constructor();
    /**
     * Gets the singleton instance of AdaptiveConcurrency.
     */
    static getInstance(config?: AdaptiveConcurrencyConfig): AdaptiveConcurrency;
    /**
     * Resets the singleton instance.
     */
    static reset(): void;
    /**
     * Gets detected device information.
     */
    getDeviceInfo(): DeviceInfo;
    /**
     * Gets the recommended pool configuration for background work.
     */
    getBackgroundPoolConfig(): PoolConfig;
    /**
     * Gets the recommended pool configuration for network I/O.
     */
    getNetworkPoolConfig(): PoolConfig;
    /**
     * Gets the recommended pool configuration for compute-intensive work.
     */
    getComputePoolConfig(): PoolConfig;
    /**
     * Executes a background task with concurrency limiting.
     */
    executeBackground<T>(task: () => Promise<T>): Promise<T>;
    /**
     * Executes a network I/O task with concurrency limiting.
     */
    executeNetwork<T>(task: () => Promise<T>): Promise<T>;
    /**
     * Executes a compute-intensive task with concurrency limiting.
     */
    executeCompute<T>(task: () => Promise<T>): Promise<T>;
    /**
     * Executes a task during browser idle time.
     * Falls back to setTimeout if requestIdleCallback is not available.
     */
    executeWhenIdle<T>(task: () => T, timeout?: number): Promise<T>;
    /**
     * Executes multiple tasks with concurrency limiting.
     */
    executeAll<T>(tasks: (() => Promise<T>)[], type?: 'background' | 'network' | 'compute'): Promise<T[]>;
    /**
     * Gets current concurrency statistics.
     */
    getStats(): ConcurrencyStats;
    private calculateBackgroundLimit;
    private calculateNetworkLimit;
    private calculateComputeLimit;
    private log;
    private static detectDeviceInfo;
}
export declare function getAdaptiveConcurrency(config?: AdaptiveConcurrencyConfig): AdaptiveConcurrency;
export default AdaptiveConcurrency;
