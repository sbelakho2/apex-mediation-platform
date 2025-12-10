/**
 * @file Publisher Data Exports
 * @description Export SDK analytics and metrics data for publishers
 * @module @rivalapex/web-sdk
 */
import { UsageMetrics, UsageBreakdown } from './usageMeter';
/**
 * Export format options
 */
export declare enum ExportFormat {
    JSON = "json",
    CSV = "csv",
    PARQUET = "parquet"
}
/**
 * Date range for exports
 */
export interface DateRange {
    startDate: Date;
    endDate: Date;
}
/**
 * Export configuration
 */
export interface ExportConfig {
    format: ExportFormat;
    dateRange?: DateRange;
    dimensions?: ExportDimension[];
    metrics?: ExportMetric[];
    filters?: ExportFilter[];
    includeBreakdowns?: boolean;
    timezone?: string;
}
/**
 * Available dimensions for grouping
 */
export declare enum ExportDimension {
    DATE = "date",
    HOUR = "hour",
    PLACEMENT = "placement",
    ADAPTER = "adapter",
    AD_FORMAT = "ad_format",
    COUNTRY = "country",
    DEVICE_TYPE = "device_type",
    OS_VERSION = "os_version",
    SDK_VERSION = "sdk_version"
}
/**
 * Available metrics for export
 */
export declare enum ExportMetric {
    REQUESTS = "requests",
    IMPRESSIONS = "impressions",
    CLICKS = "clicks",
    CTR = "ctr",
    FILL_RATE = "fill_rate",
    REVENUE = "revenue",
    ECPM = "ecpm",
    VIDEO_STARTS = "video_starts",
    VIDEO_COMPLETES = "video_completes",
    VIDEO_COMPLETION_RATE = "video_completion_rate",
    ERRORS = "errors",
    LATENCY_P50 = "latency_p50",
    LATENCY_P95 = "latency_p95",
    LATENCY_P99 = "latency_p99"
}
/**
 * Filter for exports
 */
export interface ExportFilter {
    dimension: ExportDimension;
    operator: 'equals' | 'not_equals' | 'contains' | 'in' | 'not_in';
    value: string | string[];
}
/**
 * Export result
 */
export interface ExportResult {
    success: boolean;
    format: ExportFormat;
    data?: string | Blob;
    downloadUrl?: string;
    rowCount?: number;
    generatedAt: Date;
    expiresAt?: Date;
    error?: string;
}
/**
 * Scheduled export configuration
 */
export interface ScheduledExport {
    id: string;
    name: string;
    config: ExportConfig;
    schedule: ExportSchedule;
    destination: ExportDestination;
    enabled: boolean;
    lastRunAt?: Date;
    nextRunAt?: Date;
}
/**
 * Export schedule options
 */
export interface ExportSchedule {
    frequency: 'daily' | 'weekly' | 'monthly';
    hour: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
    timezone: string;
}
/**
 * Export destination options
 */
export interface ExportDestination {
    type: 'email' | 's3' | 'gcs' | 'webhook';
    email?: string;
    s3Bucket?: string;
    s3Prefix?: string;
    gcsBucket?: string;
    gcsPrefix?: string;
    webhookUrl?: string;
    webhookHeaders?: Record<string, string>;
}
/**
 * Data row for exports
 */
export interface ExportRow {
    date?: string;
    hour?: number;
    placement?: string;
    adapter?: string;
    adFormat?: string;
    country?: string;
    deviceType?: string;
    osVersion?: string;
    sdkVersion?: string;
    requests?: number;
    impressions?: number;
    clicks?: number;
    ctr?: number;
    fillRate?: number;
    revenue?: number;
    ecpm?: number;
    videoStarts?: number;
    videoCompletes?: number;
    videoCompletionRate?: number;
    errors?: number;
    latencyP50?: number;
    latencyP95?: number;
    latencyP99?: number;
}
/**
 * Publisher data exporter
 */
export declare class PublisherExporter {
    private apiEndpoint;
    private apiKey?;
    private scheduledExports;
    constructor(config?: {
        apiEndpoint?: string;
        apiKey?: string;
    });
    /**
     * Generate an export based on configuration
     */
    generateExport(config: ExportConfig): Promise<ExportResult>;
    /**
     * Generate export data locally from metrics
     */
    generateLocalExport(metrics: UsageMetrics, breakdown?: UsageBreakdown, config?: Partial<ExportConfig>): ExportResult;
    /**
     * Convert metrics to export rows
     */
    private metricsToRows;
    /**
     * Convert a single metrics object to a row
     */
    private metricsToRow;
    /**
     * Convert rows to CSV format
     */
    private rowsToCSV;
    /**
     * Download export as file
     */
    downloadExport(result: ExportResult, filename?: string): void;
    /**
     * Create a scheduled export
     */
    createScheduledExport(name: string, config: ExportConfig, schedule: ExportSchedule, destination: ExportDestination): Promise<ScheduledExport>;
    /**
     * List all scheduled exports
     */
    listScheduledExports(): Promise<ScheduledExport[]>;
    /**
     * Update a scheduled export
     */
    updateScheduledExport(id: string, updates: Partial<ScheduledExport>): Promise<ScheduledExport>;
    /**
     * Delete a scheduled export
     */
    deleteScheduledExport(id: string): Promise<void>;
    /**
     * Enable or disable a scheduled export
     */
    setScheduledExportEnabled(id: string, enabled: boolean): Promise<ScheduledExport>;
    /**
     * Trigger a scheduled export immediately
     */
    triggerScheduledExport(id: string): Promise<ExportResult>;
}
/**
 * Builder for export configuration
 */
export declare class ExportConfigBuilder {
    private config;
    format(format: ExportFormat): this;
    dateRange(startDate: Date, endDate: Date): this;
    lastNDays(days: number): this;
    dimensions(...dimensions: ExportDimension[]): this;
    metrics(...metrics: ExportMetric[]): this;
    filter(dimension: ExportDimension, operator: ExportFilter['operator'], value: string | string[]): this;
    includeBreakdowns(include?: boolean): this;
    timezone(tz: string): this;
    build(): ExportConfig;
}
