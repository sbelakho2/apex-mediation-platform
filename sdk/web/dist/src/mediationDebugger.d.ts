/**
 * @file Mediation Debugger
 * @description Debug and trace mediation waterfall execution with sanitized output
 * @module @rivalapex/web-sdk
 */
/**
 * Event types for mediation debugging
 */
export declare enum MediationEventType {
    WATERFALL_START = "waterfall_start",
    WATERFALL_END = "waterfall_end",
    ADAPTER_REQUEST = "adapter_request",
    ADAPTER_RESPONSE = "adapter_response",
    BID_RECEIVED = "bid_received",
    NO_FILL = "no_fill",
    TIMEOUT = "timeout",
    ERROR = "error",
    AD_RENDERED = "ad_rendered",
    AD_CLICKED = "ad_clicked",
    AD_CLOSED = "ad_closed",
    CIRCUIT_BREAKER_OPEN = "circuit_breaker_open",
    CIRCUIT_BREAKER_CLOSE = "circuit_breaker_close"
}
/**
 * Mediation event structure
 */
export interface MediationEvent {
    type: MediationEventType;
    adapterId?: string;
    timestamp: number;
    latency?: number;
    success?: boolean;
    timeout?: number;
    error?: string;
    bidAmount?: number | string;
    metadata?: Record<string, unknown>;
}
/**
 * Debug session for tracking mediation
 */
export interface DebugSession {
    id: string;
    placementId: string;
    startTime: number;
    endTime?: number;
    events: MediationEvent[];
}
/**
 * Snapshot of debug session
 */
export interface DebugSnapshot {
    sessionId: string;
    placementId: string;
    startTime: number;
    events: MediationEvent[];
    summary?: {
        totalDuration: number;
        adapterCount: number;
        winningAdapter: string | null;
    };
}
/**
 * Waterfall timeline visualization
 */
export interface WaterfallTimeline {
    totalDuration: number;
    adapters: AdapterTimeline[];
    winningAdapter: string | null;
}
/**
 * Adapter timeline entry
 */
export interface AdapterTimeline {
    adapterId: string;
    startOffset: number;
    duration: number;
    result: 'success' | 'no-fill' | 'timeout' | 'error';
}
/**
 * Performance statistics for an adapter
 */
export interface PerformanceStats {
    avgLatency: number;
    minLatency: number;
    maxLatency: number;
    successRate: number;
    timeoutCount: number;
    totalRequests: number;
}
/**
 * Configuration for the debugger
 */
export interface DebuggerConfig {
    maxEventsPerSession?: number;
    sessionTimeoutMs?: number;
    sanitizeByDefault?: boolean;
    enableRealtime?: boolean;
}
/**
 * Snapshot options
 */
export interface SnapshotOptions {
    sanitize?: boolean;
}
/**
 * Event subscriber callback
 */
type EventSubscriber = (event: MediationEvent) => void;
/**
 * Mediation debugger for tracing and analyzing waterfall execution
 */
export declare class MediationDebugger {
    private sessions;
    private placementToSession;
    private subscribers;
    private config;
    private cleanupTimer;
    constructor(config?: DebuggerConfig);
    /**
     * Start a new debug session
     */
    startSession(placementId: string): DebugSession;
    /**
     * Stop a debug session
     */
    stopSession(sessionId: string): void;
    /**
     * Get a debug session
     */
    getSession(sessionId: string): DebugSession | null;
    /**
     * Get session for a placement
     */
    getSessionForPlacement(placementId: string): DebugSession | null;
    /**
     * Record a mediation event
     */
    recordEvent(sessionId: string, event: MediationEvent): void;
    /**
     * Get events for a session
     */
    getEvents(sessionId: string): MediationEvent[];
    /**
     * Get a sanitized snapshot of the session
     */
    getSnapshot(sessionId: string, options?: SnapshotOptions): DebugSnapshot | null;
    /**
     * Sanitize events to remove sensitive data
     */
    private sanitizeEvents;
    /**
     * Sanitize a single event
     */
    private sanitizeEvent;
    /**
     * Sanitize metadata object
     */
    private sanitizeMetadata;
    /**
     * Get waterfall timeline visualization
     */
    getWaterfallTimeline(sessionId: string): WaterfallTimeline | null;
    /**
     * Calculate timeline from session events
     */
    private calculateTimeline;
    /**
     * Get performance statistics for an adapter
     */
    getPerformanceStats(sessionId: string, adapterId: string): PerformanceStats | null;
    /**
     * Export session to JSON format
     */
    exportToJSON(sessionId: string, sanitize?: boolean): string | null;
    /**
     * Generate text summary of session
     */
    getTextSummary(sessionId: string): string;
    /**
     * Generate timeline visualization as ASCII art
     */
    getTimelineVisualization(sessionId: string): string;
    /**
     * Subscribe to real-time events
     */
    subscribe(sessionId: string, callback: EventSubscriber): () => void;
    /**
     * Clean up expired sessions
     */
    cleanup(): void;
    /**
     * Stop the debugger and clean up
     */
    stop(): void;
}
export {};
