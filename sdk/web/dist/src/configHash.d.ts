/**
 * SDK Configuration hash computation for cross-platform parity verification.
 * Uses SHA-256 with deterministic JSON serialization.
 * Hash format: "v1:<hex-digest>"
 */
import type { AuctionClientConfig } from './auctionClient';
export interface SDKConfig {
    appId: string;
    version: number;
    floors: Record<string, number>;
    caps: Record<string, {
        daily: number;
        hourly: number;
    }>;
    pacing: {
        enabled: boolean;
        minIntervalMs: number;
    };
    networks: string[];
    features: {
        bidding: boolean;
        waterfall: boolean;
        bannerRefresh: boolean;
        bannerRefreshIntervalMs: number;
    };
    compliance: {
        gdprApplies: boolean;
        ccpaApplies: boolean;
        coppaApplies: boolean;
    };
}
/**
 * Compute deterministic SHA-256 hash of SDK configuration.
 * Uses sorted JSON serialization to ensure cross-platform parity with server.
 * Hash format: "v1:<hex-digest>"
 *
 * @param config - SDK configuration object
 * @returns Promise resolving to configuration hash string
 */
export declare function computeConfigHash(config: SDKConfig): Promise<string>;
/**
 * Validate that local config hash matches server hash.
 * Useful for debugging configuration sync issues.
 *
 * @param config - Local SDK configuration
 * @param serverHash - Hash returned from /api/v1/config/sdk/config/hash endpoint
 * @returns Promise resolving to true if hashes match, false otherwise
 */
export declare function validateConfigHash(config: SDKConfig, serverHash: string): Promise<boolean>;
/**
 * Fetch SDK configuration from server and compute its hash.
 *
 * @param endpoint - API endpoint base URL
 * @param appId - Application ID
 * @returns Promise resolving to config and hash
 */
export declare function fetchConfigWithHash(endpoint: string, appId: string): Promise<{
    config: SDKConfig;
    hash: string;
}>;
/**
 * Create a default SDKConfig from AuctionClientConfig for hash computation
 * when server config is not available.
 */
export declare function createDefaultConfig(clientConfig: AuctionClientConfig): SDKConfig;
