import { Pool } from 'pg';
import logger from '../utils/logger';
import { sha256Hex } from '../utils/crypto';

export interface BillingAuditEntry {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorType: 'user' | 'system' | 'api';
  action: string;
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  checksum: string;
}

export interface BillingAuditQuery {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Billing Audit Trail Service
 * 
 * Provides comprehensive audit logging for all billing operations:
 * - Invoice generation and modifications
 * - Payment processing
 * - Subscription changes
 * - Fee calculations
 * - Usage metering
 * - FX conversions
 * - Dunning actions
 * 
 * All entries include checksums for tamper detection
 */
export class BillingAuditTrailService {
  constructor(private pool: Pool) {}

  /**
   * Log a billing audit event
   */
  async logEvent(params: {
    eventType: string;
    entityType: string;
    entityId: string;
    actorId: string;
    actorType: 'user' | 'system' | 'api';
    action: string;
    beforeState?: Record<string, any>;
    afterState?: Record<string, any>;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<string> {
    const client = await this.pool.connect();
    try {
      const timestamp = new Date();

      // Generate checksum for tamper detection
      const checksumData = JSON.stringify({
        eventType: params.eventType,
        entityType: params.entityType,
        entityId: params.entityId,
        actorId: params.actorId,
        action: params.action,
        timestamp: timestamp.toISOString(),
        beforeState: params.beforeState,
        afterState: params.afterState,
      });
      const checksum = sha256Hex(checksumData);

      const result = await client.query(
        `INSERT INTO billing_audit_trail (
          id, event_type, entity_type, entity_id, actor_id, actor_type,
          action, before_state, after_state, metadata, ip_address, user_agent,
          timestamp, checksum, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
        ) RETURNING id`,
        [
          params.eventType,
          params.entityType,
          params.entityId,
          params.actorId,
          params.actorType,
          params.action,
          params.beforeState ? JSON.stringify(params.beforeState) : null,
          params.afterState ? JSON.stringify(params.afterState) : null,
          params.metadata ? JSON.stringify(params.metadata) : null,
          params.ipAddress || null,
          params.userAgent || null,
          timestamp,
          checksum,
        ]
      );

      const auditId = result.rows[0].id;

      logger.info('Billing audit event logged', {
        auditId,
        eventType: params.eventType,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
      });

      return auditId;
    } catch (error) {
      logger.error('Failed to log billing audit event', { error, params });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Log invoice generation
   */
  async logInvoiceGeneration(params: {
    invoiceId: string;
    customerId: string;
    actorId: string;
    actorType: 'user' | 'system' | 'api';
    invoiceData: Record<string, any>;
    metadata?: Record<string, any>;
  }): Promise<string> {
    return this.logEvent({
      eventType: 'invoice.generated',
      entityType: 'invoice',
      entityId: params.invoiceId,
      actorId: params.actorId,
      actorType: params.actorType,
      action: 'CREATE',
      afterState: params.invoiceData,
      metadata: {
        ...params.metadata,
        customerId: params.customerId,
      },
    });
  }

  /**
   * Log invoice update
   */
  async logInvoiceUpdate(params: {
    invoiceId: string;
    actorId: string;
    actorType: 'user' | 'system' | 'api';
    beforeState: Record<string, any>;
    afterState: Record<string, any>;
    reason?: string;
  }): Promise<string> {
    return this.logEvent({
      eventType: 'invoice.updated',
      entityType: 'invoice',
      entityId: params.invoiceId,
      actorId: params.actorId,
      actorType: params.actorType,
      action: 'UPDATE',
      beforeState: params.beforeState,
      afterState: params.afterState,
      metadata: params.reason ? { reason: params.reason } : undefined,
    });
  }

  /**
   * Log payment processing
   */
  async logPaymentProcessed(params: {
    paymentId: string;
    invoiceId: string;
    customerId: string;
    amount: number;
    currency: string;
    method: string;
    status: string;
    metadata?: Record<string, any>;
  }): Promise<string> {
    return this.logEvent({
      eventType: 'payment.processed',
      entityType: 'payment',
      entityId: params.paymentId,
      actorId: 'system',
      actorType: 'system',
      action: 'CREATE',
      afterState: {
        amount: params.amount,
        currency: params.currency,
        method: params.method,
        status: params.status,
      },
      metadata: {
        ...params.metadata,
        invoiceId: params.invoiceId,
        customerId: params.customerId,
      },
    });
  }

  /**
   * Log subscription change
   */
  async logSubscriptionChange(params: {
    subscriptionId: string;
    customerId: string;
    actorId: string;
    actorType: 'user' | 'system' | 'api';
    action: 'CREATE' | 'UPDATE' | 'CANCEL' | 'REACTIVATE';
    beforeState?: Record<string, any>;
    afterState: Record<string, any>;
  }): Promise<string> {
    return this.logEvent({
      eventType: 'subscription.changed',
      entityType: 'subscription',
      entityId: params.subscriptionId,
      actorId: params.actorId,
      actorType: params.actorType,
      action: params.action,
      beforeState: params.beforeState,
      afterState: params.afterState,
      metadata: { customerId: params.customerId },
    });
  }

  /**
   * Log usage metering
   */
  async logUsageMetering(params: {
    customerId: string;
    subscriptionId: string;
    metric: string;
    quantity: number;
    timestamp: Date;
    metadata?: Record<string, any>;
  }): Promise<string> {
    return this.logEvent({
      eventType: 'usage.metered',
      entityType: 'usage',
      entityId: `${params.customerId}-${params.metric}-${params.timestamp.toISOString()}`,
      actorId: 'system',
      actorType: 'system',
      action: 'CREATE',
      afterState: {
        metric: params.metric,
        quantity: params.quantity,
        timestamp: params.timestamp,
      },
      metadata: {
        ...params.metadata,
        customerId: params.customerId,
        subscriptionId: params.subscriptionId,
      },
    });
  }

  /**
   * Log FX conversion for billing
   */
  async logFxConversion(params: {
    invoiceId: string;
    fromAmount: number;
    fromCurrency: string;
    toAmount: number;
    toCurrency: string;
    rate: number;
    source: string;
  }): Promise<string> {
    return this.logEvent({
      eventType: 'fx.converted',
      entityType: 'invoice',
      entityId: params.invoiceId,
      actorId: 'system',
      actorType: 'system',
      action: 'FX_CONVERT',
      beforeState: {
        amount: params.fromAmount,
        currency: params.fromCurrency,
      },
      afterState: {
        amount: params.toAmount,
        currency: params.toCurrency,
      },
      metadata: {
        rate: params.rate,
        source: params.source,
      },
    });
  }

  /**
   * Log dunning action
   */
  async logDunningAction(params: {
    customerId: string;
    invoiceId: string;
    action: string;
    attemptNumber: number;
    result: string;
    metadata?: Record<string, any>;
  }): Promise<string> {
    return this.logEvent({
      eventType: 'dunning.action',
      entityType: 'invoice',
      entityId: params.invoiceId,
      actorId: 'system',
      actorType: 'system',
      action: params.action,
      afterState: {
        attemptNumber: params.attemptNumber,
        result: params.result,
      },
      metadata: {
        ...params.metadata,
        customerId: params.customerId,
      },
    });
  }

  /**
   * Query audit trail
   */
  async queryAuditTrail(query: BillingAuditQuery): Promise<BillingAuditEntry[]> {
    const client = await this.pool.connect();
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (query.entityType) {
        conditions.push(`entity_type = $${paramIndex++}`);
        params.push(query.entityType);
      }

      if (query.entityId) {
        conditions.push(`entity_id = $${paramIndex++}`);
        params.push(query.entityId);
      }

      if (query.actorId) {
        conditions.push(`actor_id = $${paramIndex++}`);
        params.push(query.actorId);
      }

      if (query.eventType) {
        conditions.push(`event_type = $${paramIndex++}`);
        params.push(query.eventType);
      }

      if (query.startDate) {
        conditions.push(`timestamp >= $${paramIndex++}`);
        params.push(query.startDate);
      }

      if (query.endDate) {
        conditions.push(`timestamp <= $${paramIndex++}`);
        params.push(query.endDate);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = query.limit || 100;
      const offset = query.offset || 0;

      const result = await client.query(
        `SELECT 
          id, event_type, entity_type, entity_id, actor_id, actor_type,
          action, before_state, after_state, metadata, ip_address, user_agent,
          timestamp, checksum
         FROM billing_audit_trail
         ${whereClause}
         ORDER BY timestamp DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      return result.rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        entityType: row.entity_type,
        entityId: row.entity_id,
        actorId: row.actor_id,
        actorType: row.actor_type,
        action: row.action,
        beforeState: row.before_state ? JSON.parse(row.before_state) : undefined,
        afterState: row.after_state ? JSON.parse(row.after_state) : undefined,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        timestamp: row.timestamp,
        checksum: row.checksum,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Verify audit entry integrity
   */
  async verifyIntegrity(auditId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          event_type, entity_type, entity_id, actor_id, action,
          before_state, after_state, timestamp, checksum
         FROM billing_audit_trail
         WHERE id = $1`,
        [auditId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const row = result.rows[0];
      const checksumData = JSON.stringify({
        eventType: row.event_type,
        entityType: row.entity_type,
        entityId: row.entity_id,
        actorId: row.actor_id,
        action: row.action,
        timestamp: row.timestamp.toISOString(),
        beforeState: row.before_state ? JSON.parse(row.before_state) : undefined,
        afterState: row.after_state ? JSON.parse(row.after_state) : undefined,
      });

      const expectedChecksum = sha256Hex(checksumData);
      return expectedChecksum === row.checksum;
    } finally {
      client.release();
    }
  }

  /**
   * Get audit summary for entity
   */
  async getEntityAuditSummary(entityType: string, entityId: string): Promise<{
    totalEvents: number;
    eventTypes: Record<string, number>;
    firstEvent: Date | null;
    lastEvent: Date | null;
    actors: string[];
  }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          COUNT(*) as total_events,
          event_type,
          MIN(timestamp) as first_event,
          MAX(timestamp) as last_event,
          array_agg(DISTINCT actor_id) as actors
         FROM billing_audit_trail
         WHERE entity_type = $1 AND entity_id = $2
         GROUP BY event_type`,
        [entityType, entityId]
      );

      const eventTypes: Record<string, number> = {};
      let firstEvent: Date | null = null;
      let lastEvent: Date | null = null;
      const actorsSet = new Set<string>();

      for (const row of result.rows) {
        eventTypes[row.event_type] = parseInt(row.total_events);
        const fe = row.first_event;
        const le = row.last_event;

        if (!firstEvent || (fe && fe < firstEvent)) firstEvent = fe;
        if (!lastEvent || (le && le > lastEvent)) lastEvent = le;

        if (row.actors) {
          row.actors.forEach((actor: string) => actorsSet.add(actor));
        }
      }

      const totalResult = await client.query(
        `SELECT COUNT(*) as total FROM billing_audit_trail
         WHERE entity_type = $1 AND entity_id = $2`,
        [entityType, entityId]
      );

      return {
        totalEvents: parseInt(totalResult.rows[0].total),
        eventTypes,
        firstEvent,
        lastEvent,
        actors: Array.from(actorsSet),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Purge old audit entries (retention policy)
   */
  async purgeOldEntries(retentionDays: number = 2555): Promise<number> {
    const client = await this.pool.connect();
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await client.query(
        `DELETE FROM billing_audit_trail 
         WHERE timestamp < $1
         RETURNING id`,
        [cutoffDate]
      );

      const count = result.rowCount || 0;
      logger.info(`Purged ${count} old billing audit entries`, {
        cutoffDate,
        retentionDays,
      });

      return count;
    } finally {
      client.release();
    }
  }
}
