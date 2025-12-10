/**
 * NetworkWarmer - HTTP Preconnect & DNS Cache for Web SDK
 *
 * Optimizes network performance by:
 * - Using Resource Hints (preconnect, dns-prefetch) for browser optimization
 * - Warming up connections with HEAD requests
 * - Caching DNS resolution times for metrics
 * - Supporting both browser and Node.js environments
 */
export interface NetworkWarmerConfig {
    /** URLs to preconnect/warm up */
    endpoints: string[];
    /** Whether to use browser resource hints (preconnect, dns-prefetch) */
    useResourceHints: boolean;
    /** Connection warmup timeout in milliseconds */
    warmupTimeout: number;
    /** Enable debug logging */
    debug: boolean;
}
export interface WarmupMetrics {
    totalEndpoints: number;
    successfulConnections: number;
    failedConnections: number;
    averageLatencyMs: number;
    warmupDurationMs: number;
    lastWarmupTimestamp: number;
}
interface ConnectionResult {
    endpoint: string;
    success: boolean;
    latencyMs: number;
    error?: string;
}
/**
 * NetworkWarmer handles HTTP preconnection and DNS prefetching
 * to reduce latency for ad auction requests.
 */
export declare class NetworkWarmer {
    private config;
    private metrics;
    private connectionResults;
    private resourceHintElements;
    private isWarmedUp;
    constructor(config?: Partial<NetworkWarmerConfig>);
    /**
     * Warms up connections to all configured endpoints.
     * Uses resource hints in browser, direct connections otherwise.
     */
    warmup(): Promise<WarmupMetrics>;
    /**
     * Warms up a single connection using a HEAD request.
     */
    private warmupConnection;
    /**
     * Adds preconnect and dns-prefetch resource hints to the document head.
     */
    private addResourceHints;
    /**
     * Removes previously added resource hints.
     */
    private removeResourceHints;
    /**
     * Preconnects to a specific endpoint on-demand.
     */
    preconnect(endpoint: string): Promise<ConnectionResult>;
    /**
     * Gets the connection result for a specific endpoint.
     */
    getConnectionResult(endpoint: string): ConnectionResult | undefined;
    /**
     * Gets all connection results.
     */
    getAllConnectionResults(): Map<string, ConnectionResult>;
    /**
     * Gets the current warmup metrics.
     */
    getMetrics(): WarmupMetrics;
    /**
     * Checks if warmup has been performed.
     */
    isReady(): boolean;
    /**
     * Resets the warmer state and removes resource hints.
     */
    reset(): void;
    /**
     * Updates the endpoints configuration and optionally re-warms.
     */
    updateEndpoints(endpoints: string[], rewarm?: boolean): Promise<void>;
    /**
     * Checks if running in a browser environment.
     */
    private isBrowser;
    /**
     * Logs a message if debug is enabled.
     */
    private log;
    /**
     * Cleans up resources when the warmer is no longer needed.
     */
    destroy(): void;
}
/**
 * Gets or creates the default NetworkWarmer instance.
 */
export declare function getNetworkWarmer(config?: Partial<NetworkWarmerConfig>): NetworkWarmer;
/**
 * Resets the default NetworkWarmer instance.
 */
export declare function resetNetworkWarmer(): void;
export default NetworkWarmer;
