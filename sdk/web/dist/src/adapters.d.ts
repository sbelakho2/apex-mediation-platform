export declare const SUPPORTED_NETWORKS: readonly ["admob", "applovin", "unity", "ironsource", "facebook", "vungle", "chartboost", "pangle", "mintegral", "adcolony", "tapjoy", "moloco", "fyber", "smaato", "amazon"];
export type SupportedNetwork = typeof SUPPORTED_NETWORKS[number];
export declare function getSupportedAdapters(): SupportedNetwork[];
