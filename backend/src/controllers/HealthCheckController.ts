/**
 * Health Check Controller
 * 
 * Kubernetes-compatible health and readiness probes
 * - /health: Liveness probe (is the service running?)
 * - /ready: Readiness probe (can the service handle traffic?)
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import logger from '../utils/logger';
import { redis } from '../utils/redis';
import { checkClickHouseHealth } from '../utils/clickhouse';

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
    res.status(200).json({
      status: 'ok',
      service: 'apexmediation-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.APP_VERSION || 'unknown',
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

      // Check if database is responsive (< 1000ms)
      if (dbLatency > 1000) {
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

      // Check Redis readiness (fail open: not strictly required)
      const redisReady = redis.isReady();

      // Check ClickHouse health (optional for readiness, but informative)
      const clickhouseHealthy = await checkClickHouseHealth().catch(() => false);

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
        clickhouse: {
          healthy: clickhouseHealthy,
        },
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
}
