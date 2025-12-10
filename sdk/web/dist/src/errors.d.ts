export type SdkErrorCode = 'INIT_REQUIRED' | 'INVALID_OPTIONS' | 'NETWORK' | 'TIMEOUT' | 'BAD_RESPONSE' | 'VALIDATION' | 'NO_FILL' | 'UNKNOWN';
export declare class SdkError extends Error {
    readonly code: SdkErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: SdkErrorCode, message: string, details?: Record<string, unknown>, cause?: unknown);
}
export declare const Errors: {
    initRequired: () => SdkError;
    invalidOptions: (msg: string, details?: Record<string, unknown>) => SdkError;
    network: (msg: string, details?: Record<string, unknown>, cause?: unknown) => SdkError;
    timeout: (timeoutMs: number) => SdkError;
    badResponse: (status: number, body?: unknown) => SdkError;
    validation: (msg: string, details?: Record<string, unknown>) => SdkError;
    noFill: () => SdkError;
    unknown: (msg?: string, details?: Record<string, unknown>, cause?: unknown) => SdkError;
};
