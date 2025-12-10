/**
 * NoFillTracker - Tracks no-fill events for analytics and pattern detection
 *
 * Features:
 * - Event recording with rich metadata
 * - Hourly and daily aggregation
 * - Pattern detection (consecutive failures, elevated rates)
 * - Statistics and breakdown by source, placement, reason
 */
/**
 * Reasons for ad no-fill
 */
export declare enum NoFillReason {
    TIMEOUT = "timeout",
    NO_INVENTORY = "no_inventory",
    NETWORK_ERROR = "network_error",
    POLICY_VIOLATION = "policy_violation",
    FREQUENCY_CAP = "frequency_cap",
    GEOGRAPHIC_RESTRICTION = "geographic_restriction",
    BUDGET_EXHAUSTED = "budget_exhausted",
    MALFORMED_RESPONSE = "malformed_response",
    SERVER_ERROR = "server_error",
    UNKNOWN = "unknown"
}
/**
 * A single no-fill event
 */
export interface NoFillEvent {
    sourceId: string;
    placementId: string;
    reason: NoFillReason;
    timestamp: number;
    latencyMs: number;
    metadata: Record<string, string>;
}
/**
 * Statistics for no-fill events
 */
export interface NoFillStats {
    totalNoFills: number;
    noFillRate: number;
    averageLatencyMs: number;
    topReasons: Map<NoFillReason, number>;
    topSources: Map<string, number>;
    topPlacements: Map<string, number>;
    hourlyBreakdown: Map<number, number>;
    dailyBreakdown: Map<number, number>;
}
/**
 * Pattern type
 */
export declare enum PatternType {
    ELEVATED_RATE = "elevated_rate",
    SOURCE_SPECIFIC = "source_specific",
    PLACEMENT_SPECIFIC = "placement_specific",
    CONSECUTIVE_FAILURES = "consecutive_failures"
}
/**
 * Pattern severity
 */
export declare enum PatternSeverity {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
/**
 * Detected no-fill pattern
 */
export interface NoFillPattern {
    type: PatternType;
    severity: PatternSeverity;
    description: string;
    detectedAt: number;
    affectedSourceId?: string;
    affectedPlacementId?: string;
}
/**
 * Configuration for NoFillTracker
 */
export interface NoFillTrackerConfig {
    maxEventsRetained: number;
    maxRetentionHours: number;
    elevatedRateThreshold: number;
    patternDetectionEnabled: boolean;
    consecutiveFailureThreshold: number;
}
/**
 * Default configuration
 */
export declare const DEFAULT_CONFIG: NoFillTrackerConfig;
/**
 * Pattern listener type
 */
export type NoFillPatternListener = (pattern: NoFillPattern) => void;
/**
 * NoFillTracker class for tracking and analyzing no-fill events
 */
export declare class NoFillTracker {
    private static instance;
    private config;
    private events;
    private totalNoFills;
    private totalLatencyMs;
    private hourlyNoFills;
    private dailyNoFills;
    private noFillsBySource;
    private noFillsByPlacement;
    private noFillsByReason;
    private consecutiveNoFillsBySource;
    private detectedPatterns;
    private patternListeners;
    constructor(config?: Partial<NoFillTrackerConfig>);
    /**
     * Get singleton instance
     */
    static getInstance(): NoFillTracker;
    /**
     * Reset singleton instance (for testing)
     */
    static resetInstance(): void;
    /**
     * Record a no-fill event
     */
    recordNoFill(sourceId: string, placementId: string, reason: NoFillReason, latencyMs?: number, metadata?: Record<string, string>): void;
    /**
     * Record a successful fill (resets consecutive failure counter)
     */
    recordFill(sourceId: string): void;
    /**
     * Get current statistics
     */
    getStats(): NoFillStats;
    /**
     * Get hourly breakdown
     */
    getHourlyBreakdown(): Map<number, number>;
    /**
     * Get daily breakdown
     */
    getDailyBreakdown(): Map<number, number>;
    /**
     * Get no-fills by source
     */
    getNoFillsBySource(): Map<string, number>;
    /**
     * Get no-fills by placement
     */
    getNoFillsByPlacement(): Map<string, number>;
    /**
     * Get no-fills by reason
     */
    getNoFillsByReason(): Map<NoFillReason, number>;
    /**
     * Get events in a time range
     */
    getEvents(from: number, to: number): NoFillEvent[];
    /**
     * Get recent events
     */
    getRecentEvents(count?: number): NoFillEvent[];
    /**
     * Get detected patterns
     */
    getDetectedPatterns(): NoFillPattern[];
    /**
     * Add pattern listener
     */
    addPatternListener(listener: NoFillPatternListener): void;
    /**
     * Remove pattern listener
     */
    removePatternListener(listener: NoFillPatternListener): void;
    /**
     * Clear all data
     */
    clear(): void;
    /**
     * Update configuration
     */
    updateConfiguration(config: Partial<NoFillTrackerConfig>): void;
    /**
     * Get current configuration
     */
    getConfiguration(): NoFillTrackerConfig;
    private cleanupIfNeeded;
    private detectPatternsForEvent;
    private addPattern;
}
/**
 * Analyzer for no-fill patterns and recommendations
 */
export declare class NoFillAnalyzer {
    private tracker;
    constructor(tracker?: NoFillTracker);
    /**
     * Analyze current no-fill patterns
     */
    analyze(): {
        summary: string;
        recommendations: string[];
        healthScore: number;
        problematicSources: string[];
        problematicPlacements: string[];
    };
}
