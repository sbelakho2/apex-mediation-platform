import type { AdRequest, AdResponse, ConsentState, InitOptions } from './types';
export type AuctionClientConfig = Required<Pick<InitOptions, 'endpoint' | 'timeoutMs' | 'maxRetries' | 'retryBackoffBaseMs' | 'retryJitterMs'>> & {
    publisherId?: string;
    appId?: string;
    sdkVersion: string;
};
export declare function requestAuction(cfg: AuctionClientConfig, consent: ConsentState | undefined, req: AdRequest): Promise<AdResponse>;
