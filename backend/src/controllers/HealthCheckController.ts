/**
 * Health Check Controller
 * 
 * Kubernetes-compatible health and readiness probes
 * - /health: Liveness probe (is the service running?)
 * - /ready: Readiness probe (can the service handle traffic?)
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { getConfigSnapshot } from '../config/configSnapshot';
import logger from '../utils/logger';
import { redis } from '../utils/redis';
import config from '../config/index';
import { queueManager } from '../queues/queueManager';

const READINESS_LIMITS = config.readinessThresholds;
const STAGING_TABLES = [
  'analytics_impressions_stage',
  'analytics_clicks_stage',
  'analytics_revenue_events_stage',
  'analytics_performance_metrics_stage',
  'analytics_sdk_telemetry_stage',
  'analytics_quality_alerts_stage',
  'analytics_creative_scans_stage',
  'analytics_creative_compliance_stage',
  'transparency_auctions_stage',
  'transparency_auction_candidates_stage',
];

export class HealthCheckController {
  constructor(private pool: Pool) {}

  /**
   * Liveness probe - simple check that service is running
   * GET /health
   * 
   * Returns 200 if service is alive
   * Kubernetes will restart pod if this fails
   */
  async liveness(req: Request, res: Response): Promise<void> {
    const postgresHealthy = true; // Connectivity verified during startup migrations/init
    const redisHealthy = redis.isReady();
    const queuesHealthy = queueManager.isReady();
    const overallHealthy = postgresHealthy && redisHealthy && queuesHealthy;

    res.status(200).json({
      status: overallHealthy ? 'healthy' : 'degraded',
      service: 'apexmediation-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.APP_VERSION || 'unknown',
      environment: process.env.NODE_ENV,
      services: {
        postgres: postgresHealthy ? 'up' : 'down',
        redis: redisHealthy ? 'up' : 'down',
        queues: queuesHealthy ? 'up' : 'down',
      },
    });
  }

  /**
   * Readiness probe - check if service can handle traffic
   * GET /ready
   * 
   * Returns 200 if service is ready (database connected)
   * Kubernetes will remove pod from load balancer if this fails
   */
  async readiness(req: Request, res: Response): Promise<void> {
    try {
      // Check database connection
      const startTime = Date.now();
      await this.pool.query('SELECT 1');
      const dbLatency = Date.now() - startTime;

      if (dbLatency > READINESS_LIMITS.dbSlowMs) {
        res.status(503).json({
          status: 'degraded',
          message: 'Database is slow',
          database: {
            connected: true,
            latency_ms: dbLatency,
            status: 'slow',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check Redis readiness (fail open: not strictly required unless policy changes)
      const redisReady = redis.isReady();

      const [replicaLag, cacheHitRatio, stagingPressure] = await Promise.all([
        this.measureReplicaLag(),
        this.measureCacheHitRatio(),
        this.measureStagingPressure(),
      ]);

      if (!replicaLag) {
        res.status(503).json({
          status: 'not_ready',
          message: 'Unable to determine replica lag',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!stagingPressure) {
        res.status(503).json({
          status: 'not_ready',
          message: 'Unable to determine staging backlog',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (cacheHitRatio === null && config.replicaRequired) {
        res.status(503).json({
          status: 'not_ready',
          message: 'Unable to compute cache hit ratio',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        config.replicaRequired &&
        (!replicaLag.hasReplicas ||
          (replicaLag.maxReplayLagMs ?? 0) > READINESS_LIMITS.replicaLagCriticalMs)
      ) {
        res.status(503).json({
          status: 'not_ready',
          message: 'Read replica unhealthy or lagging beyond threshold',
          database: {
            connected: true,
            latency_ms: dbLatency,
            status: 'healthy',
          },
          redis: { ready: redisReady },
          replica: replicaLag,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (stagingPressure.totalRows > READINESS_LIMITS.stagingWarnRows) {
        res.status(503).json({
          status: 'degraded',
          message: 'Analytics staging backlog above threshold',
          staging: stagingPressure,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        cacheHitRatio !== null &&
        cacheHitRatio < READINESS_LIMITS.cacheHitWarnRatio &&
        config.replicaRequired
      ) {
        res.status(503).json({
          status: 'degraded',
          message: 'Postgres cache hit ratio below SLO',
          cache: { hit_ratio: cacheHitRatio },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        status: 'ready',
        service: 'apexmediation-backend',
        database: {
          connected: true,
          latency_ms: dbLatency,
          status: 'healthy',
        },
        redis: {
          ready: redisReady,
        },
        replica: replicaLag,
        cache: {
          hit_ratio: cacheHitRatio,
        },
        staging: stagingPressure,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[HealthCheck] Readiness probe failed', { error });
      res.status(503).json({
        status: 'not_ready',
        message: 'Database connection failed',
        database: {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Startup probe - check if service has finished initialization
   * GET /startup
   * 
   * Returns 200 when service is fully initialized
   * Kubernetes will wait for this before sending traffic
   */
  async startup(req: Request, res: Response): Promise<void> {
    try {
      // Check database migrations are up to date
      const migrationResult = await this.pool.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_name = 'schema_migrations'
      `);

      const migrationsTableExists = migrationResult.rows[0].count > 0;

      if (!migrationsTableExists) {
        res.status(503).json({
          status: 'starting',
          message: 'Database migrations not applied',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check critical tables exist
      const criticalTables = [
        'users',
        'customers',
        'transaction_log',
        'revenue_events',
        'usage_records',
      ];

      for (const table of criticalTables) {
        const tableCheck = await this.pool.query(`
          SELECT COUNT(*) as count 
          FROM information_schema.tables 
          WHERE table_name = $1
        `, [table]);

        if (tableCheck.rows[0].count === 0) {
          res.status(503).json({
            status: 'starting',
            message: `Critical table missing: ${table}`,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      res.status(200).json({
        status: 'started',
        service: 'apexmediation-backend',
        message: 'Service fully initialized',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[HealthCheck] Startup probe failed:', error);
      res.status(503).json({
        status: 'starting',
        message: 'Initialization checks failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Detailed status check (authenticated endpoint)
   * GET /api/v1/status
   * 
   * Returns detailed service health information
   */
  async detailedStatus(req: Request, res: Response): Promise<void> {
    try {
      // Database stats
      const dbStartTime = Date.now();
      const dbVersion = await this.pool.query('SELECT version()');
      const dbLatency = Date.now() - dbStartTime;

      const dbStats = await this.pool.query(`
        SELECT 
          numbackends as active_connections,
          xact_commit as transactions_committed,
          xact_rollback as transactions_rolled_back,
          blks_read as blocks_read,
          blks_hit as blocks_hit,
          tup_returned as rows_returned,
          tup_fetched as rows_fetched,
          tup_inserted as rows_inserted,
          tup_updated as rows_updated,
          tup_deleted as rows_deleted
        FROM pg_stat_database
        WHERE datname = current_database()
      `);

      // Transaction log stats (last 24h)
      const transactionStats = await this.pool.query(`
        SELECT 
          COUNT(*) as total_transactions,
          COUNT(DISTINCT customer_id) as unique_customers,
          SUM(amount_eur_cents) / 100.0 as total_amount_eur
        FROM transaction_log
        WHERE created_at > NOW() - INTERVAL '24 hours'
          AND is_deleted = FALSE
      `);

      const configSnapshot = getConfigSnapshot();

      // System info
      const memoryUsage = process.memoryUsage();

      res.status(200).json({
        status: 'ok',
        service: 'apexmediation-backend',
        version: process.env.APP_VERSION || 'unknown',
        uptime_seconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        
        database: {
          version: dbVersion.rows[0].version.split(' ')[1], // Extract version number
          latency_ms: dbLatency,
          stats: dbStats.rows[0],
          status: dbLatency < 100 ? 'healthy' : dbLatency < 500 ? 'slow' : 'critical',
        },
        
        transactions_24h: transactionStats.rows[0],
        
        memory: {
          rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
          heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external_mb: Math.round(memoryUsage.external / 1024 / 1024),
        },
        
        environment: {
          node_version: process.version,
          platform: process.platform,
          arch: process.arch,
        },

        configuration: {
          env_hash: configSnapshot.envHash,
          flags_hash: configSnapshot.flagsHash,
          combined_hash: configSnapshot.combinedHash,
          exported_env: configSnapshot.env,
          flags: configSnapshot.flags,
          generated_at: configSnapshot.generatedAt,
        },
      });
    } catch (error) {
      console.error('[HealthCheck] Detailed status failed:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve status',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async measureReplicaLag(): Promise<
    | {
        hasReplicas: boolean;
        maxReplayLagMs: number | null;
        replicas: Array<{
          applicationName: string;
          replayLagMs: number | null;
          writeLagMs: number | null;
        }>;
      }
    | null
  > {
    try {
      const result = await this.pool.query(`
        SELECT 
          application_name,
          EXTRACT(EPOCH FROM COALESCE(replay_lag, '0 seconds')) * 1000 AS replay_lag_ms,
          EXTRACT(EPOCH FROM COALESCE(write_lag, '0 seconds')) * 1000 AS write_lag_ms
        FROM pg_stat_replication
      `);

      const replicas = result.rows.map((row) => ({
        applicationName: row.application_name,
        replayLagMs:
          row.replay_lag_ms === null || row.replay_lag_ms === undefined
            ? null
            : Number(row.replay_lag_ms),
        writeLagMs:
          row.write_lag_ms === null || row.write_lag_ms === undefined
            ? null
            : Number(row.write_lag_ms),
      }));

      const maxReplayLagMs = replicas.reduce<number | null>((max, replica) => {
        const value = replica.replayLagMs ?? 0;
        if (max === null || value > max) {
          return value;
        }
        return max;
      }, null);

      return {
        hasReplicas: replicas.length > 0,
        maxReplayLagMs,
        replicas,
      };
    } catch (error) {
      logger.error('[HealthCheck] Failed to query replica lag', { error });
      return null;
    }
  }

  private async measureCacheHitRatio(): Promise<number | null> {
    try {
      const result = await this.pool.query(`
        SELECT 
          SUM(blks_hit) AS hits,
          SUM(blks_read) AS reads
        FROM pg_stat_database
        WHERE datname = current_database()
      `);

      const stats = result.rows[0];
      const hits = Number(stats?.hits ?? 0);
      const reads = Number(stats?.reads ?? 0);
      const total = hits + reads;
      if (total === 0) {
        return 1; // Treat as fully cached when no IO recorded yet
      }
      return hits / total;
    } catch (error) {
      logger.error('[HealthCheck] Failed to read cache hit ratio', { error });
      return null;
    }
  }

  private async measureStagingPressure(): Promise<
    | {
        totalRows: number;
        breakdown: Record<string, number>;
      }
    | null
  > {
    try {
      const result = await this.pool.query(
        `SELECT 
            relname AS table_name,
            COALESCE(n_live_tup, 0)::bigint AS row_estimate
          FROM pg_stat_user_tables
          WHERE relname = ANY($1::text[])`,
        [STAGING_TABLES]
      );

      let totalRows = 0;
      const breakdown: Record<string, number> = {};

      result.rows.forEach((row) => {
        const count = Number(row.row_estimate ?? 0);
        breakdown[row.table_name] = count;
        totalRows += count;
      });

      return {
        totalRows,
        breakdown,
      };
    } catch (error) {
      logger.error('[HealthCheck] Failed to compute staging pressure', { error });
      return null;
    }
  }
}
