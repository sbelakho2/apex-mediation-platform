import { z } from 'zod';
export declare const ConsentSchema: z.ZodObject<{
    gdprApplies: z.ZodOptional<z.ZodBoolean>;
    tcfConsent: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    usPrivacy: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    gpp: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    coppa: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    gdprApplies?: boolean | undefined;
    tcfConsent?: string | null | undefined;
    usPrivacy?: string | null | undefined;
    gpp?: string | null | undefined;
    coppa?: boolean | undefined;
}, {
    gdprApplies?: boolean | undefined;
    tcfConsent?: string | null | undefined;
    usPrivacy?: string | null | undefined;
    gpp?: string | null | undefined;
    coppa?: boolean | undefined;
}>;
export declare const AdRequestSchema: z.ZodObject<{
    placement: z.ZodString;
    adType: z.ZodEnum<["banner", "interstitial", "rewarded"]>;
    width: z.ZodOptional<z.ZodNumber>;
    height: z.ZodOptional<z.ZodNumber>;
    testMode: z.ZodOptional<z.ZodBoolean>;
    extras: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    placement: string;
    adType: "banner" | "interstitial" | "rewarded";
    width?: number | undefined;
    height?: number | undefined;
    testMode?: boolean | undefined;
    extras?: Record<string, any> | undefined;
}, {
    placement: string;
    adType: "banner" | "interstitial" | "rewarded";
    width?: number | undefined;
    height?: number | undefined;
    testMode?: boolean | undefined;
    extras?: Record<string, any> | undefined;
}>;
export declare const AuctionRequestSchema: z.ZodObject<{
    request: z.ZodObject<{
        placement: z.ZodString;
        adType: z.ZodEnum<["banner", "interstitial", "rewarded"]>;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
        testMode: z.ZodOptional<z.ZodBoolean>;
        extras: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        placement: string;
        adType: "banner" | "interstitial" | "rewarded";
        width?: number | undefined;
        height?: number | undefined;
        testMode?: boolean | undefined;
        extras?: Record<string, any> | undefined;
    }, {
        placement: string;
        adType: "banner" | "interstitial" | "rewarded";
        width?: number | undefined;
        height?: number | undefined;
        testMode?: boolean | undefined;
        extras?: Record<string, any> | undefined;
    }>;
    consent: z.ZodOptional<z.ZodObject<{
        gdprApplies: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        tcfConsent: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
        usPrivacy: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
        gpp: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
        coppa: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        gdprApplies?: boolean | undefined;
        tcfConsent?: string | null | undefined;
        usPrivacy?: string | null | undefined;
        gpp?: string | null | undefined;
        coppa?: boolean | undefined;
    }, {
        gdprApplies?: boolean | undefined;
        tcfConsent?: string | null | undefined;
        usPrivacy?: string | null | undefined;
        gpp?: string | null | undefined;
        coppa?: boolean | undefined;
    }>>;
    meta: z.ZodObject<{
        sdk: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            version: string;
        }, {
            name: string;
            version: string;
        }>;
        publisherId: z.ZodOptional<z.ZodString>;
        appId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        sdk: {
            name: string;
            version: string;
        };
        publisherId?: string | undefined;
        appId?: string | undefined;
    }, {
        sdk: {
            name: string;
            version: string;
        };
        publisherId?: string | undefined;
        appId?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    request: {
        placement: string;
        adType: "banner" | "interstitial" | "rewarded";
        width?: number | undefined;
        height?: number | undefined;
        testMode?: boolean | undefined;
        extras?: Record<string, any> | undefined;
    };
    meta: {
        sdk: {
            name: string;
            version: string;
        };
        publisherId?: string | undefined;
        appId?: string | undefined;
    };
    consent?: {
        gdprApplies?: boolean | undefined;
        tcfConsent?: string | null | undefined;
        usPrivacy?: string | null | undefined;
        gpp?: string | null | undefined;
        coppa?: boolean | undefined;
    } | undefined;
}, {
    request: {
        placement: string;
        adType: "banner" | "interstitial" | "rewarded";
        width?: number | undefined;
        height?: number | undefined;
        testMode?: boolean | undefined;
        extras?: Record<string, any> | undefined;
    };
    meta: {
        sdk: {
            name: string;
            version: string;
        };
        publisherId?: string | undefined;
        appId?: string | undefined;
    };
    consent?: {
        gdprApplies?: boolean | undefined;
        tcfConsent?: string | null | undefined;
        usPrivacy?: string | null | undefined;
        gpp?: string | null | undefined;
        coppa?: boolean | undefined;
    } | undefined;
}>;
export declare const AdCreativeSchema: z.ZodObject<{
    id: z.ZodString;
    html: z.ZodOptional<z.ZodString>;
    vastTagUrl: z.ZodOptional<z.ZodString>;
    tracking: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    html?: string | undefined;
    vastTagUrl?: string | undefined;
    tracking?: Record<string, string> | undefined;
}, {
    id: string;
    html?: string | undefined;
    vastTagUrl?: string | undefined;
    tracking?: Record<string, string> | undefined;
}>;
export declare const AdResponseSchema: z.ZodObject<{
    requestId: z.ZodString;
    fill: z.ZodBoolean;
    price: z.ZodOptional<z.ZodNumber>;
    currency: z.ZodOptional<z.ZodString>;
    creative: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        html: z.ZodOptional<z.ZodString>;
        vastTagUrl: z.ZodOptional<z.ZodString>;
        tracking: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        html?: string | undefined;
        vastTagUrl?: string | undefined;
        tracking?: Record<string, string> | undefined;
    }, {
        id: string;
        html?: string | undefined;
        vastTagUrl?: string | undefined;
        tracking?: Record<string, string> | undefined;
    }>>>;
    ttlSeconds: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    fill: boolean;
    requestId: string;
    price?: number | undefined;
    currency?: string | undefined;
    creative?: {
        id: string;
        html?: string | undefined;
        vastTagUrl?: string | undefined;
        tracking?: Record<string, string> | undefined;
    } | null | undefined;
    ttlSeconds?: number | undefined;
}, {
    fill: boolean;
    requestId: string;
    price?: number | undefined;
    currency?: string | undefined;
    creative?: {
        id: string;
        html?: string | undefined;
        vastTagUrl?: string | undefined;
        tracking?: Record<string, string> | undefined;
    } | null | undefined;
    ttlSeconds?: number | undefined;
}>;
export type ConsentSchemaType = z.infer<typeof ConsentSchema>;
export type AdRequestSchemaType = z.infer<typeof AdRequestSchema>;
export type AuctionRequestSchemaType = z.infer<typeof AuctionRequestSchema>;
export type AdResponseSchemaType = z.infer<typeof AdResponseSchema>;
