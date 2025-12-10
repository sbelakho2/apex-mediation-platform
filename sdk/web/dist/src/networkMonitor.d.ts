/**
 * NetworkMonitor - Monitors network connectivity and provides fast-fail behavior.
 *
 * This module provides:
 * - Real-time network state monitoring using Navigator.onLine and Network Information API
 * - Fast-fail for no-network conditions (no UI jank)
 * - Connection quality assessment
 * - Callback-based network state change notifications
 */
/** Fast-fail timeout when offline (ms) */
export declare const OFFLINE_FAST_FAIL_TIMEOUT_MS = 100;
/** Normal network timeout (ms) */
export declare const NORMAL_TIMEOUT_MS = 10000;
/** Connection type enumeration */
export type ConnectionType = 'none' | 'wifi' | 'cellular' | 'ethernet' | 'bluetooth' | 'wimax' | 'other' | 'unknown';
/** Effective connection type (from Network Information API) */
export type EffectiveConnectionType = 'slow-2g' | '2g' | '3g' | '4g';
/** Network state information */
export interface NetworkState {
    readonly isConnected: boolean;
    readonly connectionType: ConnectionType;
    readonly effectiveType: EffectiveConnectionType | null;
    readonly downlinkMbps: number | null;
    readonly rtt: number | null;
    readonly saveData: boolean;
    readonly timestamp: number;
}
/** Result of a pre-flight check before network operations */
export type PreflightResult = {
    type: 'proceed';
    state: NetworkState;
} | {
    type: 'fastFail';
    reason: string;
    state: NetworkState;
};
/** Listener callback for network state changes */
export type NetworkStateListener = (state: NetworkState) => void;
/** Class-based NetworkMonitor implementation */
export declare class NetworkMonitor {
    private static instance;
    private currentState;
    private listeners;
    private isMonitoring;
    private connection;
    private boundOnlineHandler;
    private boundOfflineHandler;
    private boundConnectionHandler;
    private constructor();
    /** Gets the singleton instance */
    static getInstance(): NetworkMonitor;
    /** Resets the singleton (for testing) */
    static resetInstance(): void;
    /** Gets the current network state */
    get state(): NetworkState;
    /** Checks if network is currently connected */
    get isConnected(): boolean;
    /** Checks if save-data mode is enabled */
    get isSaveData(): boolean;
    /** Starts monitoring network state changes */
    startMonitoring(): void;
    /** Stops monitoring network state changes */
    stopMonitoring(): void;
    /**
     * Performs a preflight check before network operations.
     * Returns immediately if offline, allowing fast-fail behavior.
     */
    preflight(): PreflightResult;
    /**
     * Gets the appropriate timeout based on network state.
     * Returns fast-fail timeout when offline.
     */
    effectiveTimeoutMs(): number;
    /**
     * Adds a listener for network state changes.
     * @returns A token to use when removing the listener
     */
    addListener(listener: NetworkStateListener): string;
    /**
     * Removes a listener using its token.
     */
    removeListener(token: string): void;
    /**
     * Gets network quality hints for adaptive behavior.
     */
    qualityHints(): Record<string, unknown>;
    /**
     * Checks if connection is suitable for high-quality media.
     */
    isSuitableForHighQuality(): boolean;
    /** Forces an immediate state update */
    forceUpdate(): void;
    private handleOnline;
    private handleOffline;
    private handleConnectionChange;
    private updateState;
    private notifyListeners;
}
/** Functional API for simpler use cases */
/** Gets the shared NetworkMonitor instance */
export declare function getNetworkMonitor(): NetworkMonitor;
/** Starts network monitoring */
export declare function startNetworkMonitoring(): void;
/** Stops network monitoring */
export declare function stopNetworkMonitoring(): void;
/** Gets current network state */
export declare function getNetworkState(): NetworkState;
/** Checks if network is connected */
export declare function isNetworkConnected(): boolean;
/** Performs a preflight check before network operations */
export declare function preflightNetworkCheck(): PreflightResult;
/** Gets effective timeout based on network state */
export declare function getEffectiveTimeout(): number;
/** Gets network quality hints */
export declare function getNetworkQualityHints(): Record<string, unknown>;
/** Adds a network state change listener */
export declare function addNetworkListener(listener: NetworkStateListener): string;
/** Removes a network state change listener */
export declare function removeNetworkListener(token: string): void;
/** Error class for fast-fail on no-network conditions */
export declare class NoNetworkError extends Error {
    readonly networkState: NetworkState;
    constructor(message: string, networkState: NetworkState);
}
