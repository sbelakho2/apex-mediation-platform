/**
 * PostMessageBridge - CSP-Compliant Cross-Origin Communication
 *
 * Provides secure, CSP-compliant postMessage communication between
 * ad iframe and parent publisher page.
 *
 * Features:
 * - Strict origin validation
 * - Request/response pattern with timeouts
 * - Message namespace isolation
 * - No eval or inline scripts (CSP-compliant)
 * - Structured clone compatible payloads
 */
/**
 * Configuration for the PostMessageBridge
 */
export interface PostMessageConfig {
    /** List of allowed origins (exact match or wildcard patterns) */
    allowedOrigins: string[];
    /** Target window for sending messages (e.g., parent, iframe contentWindow) */
    targetWindow?: Window | null;
    /** Callback for incoming messages */
    onMessage?: (message: PostMessagePayload) => void;
    /** Timeout for request/response pattern (ms) */
    timeout?: number;
    /** Enable debug logging */
    enableLogging?: boolean;
}
/**
 * Message payload structure
 */
export interface PostMessagePayload {
    /** Message type identifier */
    type: string;
    /** Unique message ID (namespaced) */
    id: string;
    /** Message timestamp */
    timestamp: number;
    /** Message data (must be structured-clone compatible) */
    data: unknown;
}
/**
 * Statistics for monitoring bridge usage
 */
export interface PostMessageStats {
    messagesSent: number;
    messagesReceived: number;
    messagesRejected: number;
    requestsCompleted: number;
    requestsTimedOut: number;
    errors: number;
}
/**
 * CSP-compliant PostMessage bridge for cross-origin communication
 */
export declare class PostMessageBridge {
    private readonly config;
    private readonly pendingRequests;
    private messageHandler;
    private readonly NAMESPACE;
    private stats;
    constructor(config: PostMessageConfig);
    /**
     * Check if an origin is allowed
     */
    isOriginAllowed(origin: string): boolean;
    /**
     * Start listening for messages
     */
    start(): void;
    /**
     * Stop listening and clean up
     */
    stop(): void;
    /**
     * Send a message to the target window
     */
    send(type: string, data: unknown): string;
    /**
     * Send a request and wait for response
     */
    request<T>(type: string, data: unknown): Promise<T>;
    /**
     * Send a response to a request
     */
    respond(requestId: string, data: unknown): void;
    /**
     * Send an error response to a request
     */
    respondError(requestId: string, error: string): void;
    /**
     * Get bridge statistics
     */
    getStats(): PostMessageStats;
    /**
     * Reset statistics
     */
    resetStats(): void;
    private handleMessage;
    private isValidPayload;
    private postToTarget;
    private generateId;
    private log;
}
/**
 * Message types for SDK communication
 */
export declare const MessageTypes: {
    readonly INIT: "init";
    readonly INIT_RESPONSE: "init.response";
    readonly AD_REQUEST: "ad.request";
    readonly AD_RESPONSE: "ad.response";
    readonly AD_LOADED: "ad.loaded";
    readonly AD_FAILED: "ad.failed";
    readonly AD_IMPRESSION: "ad.impression";
    readonly AD_CLICK: "ad.click";
    readonly AD_COMPLETE: "ad.complete";
    readonly CONSENT_REQUEST: "consent.request";
    readonly CONSENT_RESPONSE: "consent.response";
    readonly CONSENT_UPDATE: "consent.update";
    readonly MRAID_READY: "mraid.ready";
    readonly MRAID_EXPAND: "mraid.expand";
    readonly MRAID_CLOSE: "mraid.close";
    readonly MRAID_RESIZE: "mraid.resize";
    readonly VIEWABILITY_UPDATE: "viewability.update";
    readonly VIEWABILITY_MRC50: "viewability.mrc50";
    readonly ERROR: "error";
};
export type MessageType = (typeof MessageTypes)[keyof typeof MessageTypes];
/**
 * Helper function to create a publisher-side bridge
 */
export declare function createPublisherBridge(config: {
    adIframe: HTMLIFrameElement;
    allowedOrigins: string[];
    onAdEvent?: (event: PostMessagePayload) => void;
    timeout?: number;
}): PostMessageBridge;
/**
 * Helper function to create an ad-side bridge (inside iframe)
 */
export declare function createAdBridge(config: {
    publisherOrigin: string;
    onPublisherMessage?: (message: PostMessagePayload) => void;
    timeout?: number;
}): PostMessageBridge;
