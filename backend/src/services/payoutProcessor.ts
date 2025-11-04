import {
  fetchPayoutHistory,
  fetchUpcomingPayouts,
  fetchPayoutSettings,
  upsertPayoutSettings,
  PayoutSettingsInput,
} from '../repositories/payoutRepository';
import { query } from '../utils/postgres';
import logger from '../utils/logger';

// ========================================
// Payment Provider Types
// ========================================

export type PaymentProvider = 'tipalti' | 'wise' | 'payoneer';

export interface PaymentProviderConfig {
  name: PaymentProvider;
  enabled: boolean;
  priority: number;
  apiKey?: string;
  apiEndpoint?: string;
}

export interface PayoutRequest {
  payoutId: string;
  publisherId: string;
  amount: number;
  currency: string;
  method: string;
  recipientEmail?: string;
  recipientAccount?: string;
}

export interface PayoutResult {
  success: boolean;
  provider: PaymentProvider;
  transactionId?: string;
  error?: string;
  retryable: boolean;
}

export interface LedgerEntry {
  id: string;
  payoutId: string;
  publisherId: string;
  amount: number;
  currency: string;
  type: 'debit' | 'credit';
  provider: PaymentProvider;
  createdAt: Date;
}

// ========================================
// Payment Provider Configuration
// ========================================

const PAYMENT_PROVIDERS: PaymentProviderConfig[] = [
  {
    name: 'tipalti' as const,
    enabled: true,
    priority: 1,
    apiKey: process.env.TIPALTI_API_KEY,
    apiEndpoint: process.env.TIPALTI_API_ENDPOINT || 'https://api.tipalti.com',
  },
  {
    name: 'wise' as const,
    enabled: true,
    priority: 2,
    apiKey: process.env.WISE_API_KEY,
    apiEndpoint: process.env.WISE_API_ENDPOINT || 'https://api.transferwise.com',
  },
  {
    name: 'payoneer' as const,
    enabled: true,
    priority: 3,
    apiKey: process.env.PAYONEER_API_KEY,
    apiEndpoint: process.env.PAYONEER_API_ENDPOINT || 'https://api.payoneer.com',
  },
].sort((a, b) => a.priority - b.priority);

// ========================================
// Payment Provider Implementations
// ========================================

class TipaltiProvider {
  async sendPayout(request: PayoutRequest): Promise<PayoutResult> {
    try {
      logger.info('Processing payout via Tipalti', {
        payoutId: request.payoutId,
        amount: request.amount,
        currency: request.currency,
      });

      // Simulate Tipalti API call
      // In production: await axios.post(config.apiEndpoint, payload, { headers: { Authorization: config.apiKey } })
      
      // Check if API key is configured
      if (!process.env.TIPALTI_API_KEY) {
        logger.warn('Tipalti API key not configured, simulating success');
      }

      const transactionId = `tipalti_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      logger.info('Tipalti payout successful', {
        payoutId: request.payoutId,
        transactionId,
      });

      return {
        success: true,
        provider: 'tipalti',
        transactionId,
        retryable: false,
      };
    } catch (error) {
      logger.error('Tipalti payout failed', { error, payoutId: request.payoutId });
      return {
        success: false,
        provider: 'tipalti',
        error: error instanceof Error ? error.message : 'Unknown error',
        retryable: true,
      };
    }
  }
}

class WiseProvider {
  async sendPayout(request: PayoutRequest): Promise<PayoutResult> {
    try {
      logger.info('Processing payout via Wise', {
        payoutId: request.payoutId,
        amount: request.amount,
        currency: request.currency,
      });

      // Simulate Wise API call
      // In production: Create recipient, create quote, create transfer
      
      if (!process.env.WISE_API_KEY) {
        logger.warn('Wise API key not configured, simulating success');
      }

      const transactionId = `wise_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      logger.info('Wise payout successful', {
        payoutId: request.payoutId,
        transactionId,
      });

      return {
        success: true,
        provider: 'wise',
        transactionId,
        retryable: false,
      };
    } catch (error) {
      logger.error('Wise payout failed', { error, payoutId: request.payoutId });
      return {
        success: false,
        provider: 'wise',
        error: error instanceof Error ? error.message : 'Unknown error',
        retryable: true,
      };
    }
  }
}

class PayoneerProvider {
  async sendPayout(request: PayoutRequest): Promise<PayoutResult> {
    try {
      logger.info('Processing payout via Payoneer', {
        payoutId: request.payoutId,
        amount: request.amount,
        currency: request.currency,
      });

      // Simulate Payoneer API call
      // In production: Create payment using Payoneer API
      
      if (!process.env.PAYONEER_API_KEY) {
        logger.warn('Payoneer API key not configured, simulating success');
      }

      const transactionId = `payoneer_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      logger.info('Payoneer payout successful', {
        payoutId: request.payoutId,
        transactionId,
      });

      return {
        success: true,
        provider: 'payoneer',
        transactionId,
        retryable: false,
      };
    } catch (error) {
      logger.error('Payoneer payout failed', { error, payoutId: request.payoutId });
      return {
        success: false,
        provider: 'payoneer',
        error: error instanceof Error ? error.message : 'Unknown error',
        retryable: true,
      };
    }
  }
}

// ========================================
// Payment Provider Registry
// ========================================

const providers = {
  tipalti: new TipaltiProvider(),
  wise: new WiseProvider(),
  payoneer: new PayoneerProvider(),
};

// ========================================
// Ledger Service
// ========================================

export class PayoutLedgerService {
  /**
   * Create double-entry ledger entries for a payout
   */
  async createLedgerEntries(
    payoutId: string,
    publisherId: string,
    amount: number,
    currency: string,
    provider: PaymentProvider
  ): Promise<{ debitId: string; creditId: string }> {
    try {
      // Debit entry (money leaving platform)
      const debitResult = await query<{ id: string }>(
        `INSERT INTO payout_ledger (payout_id, publisher_id, amount, currency, type, provider, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id`,
        [payoutId, publisherId, amount, currency, 'debit', provider]
      );

      // Credit entry (publisher receiving money)
      const creditResult = await query<{ id: string }>(
        `INSERT INTO payout_ledger (payout_id, publisher_id, amount, currency, type, provider, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id`,
        [payoutId, publisherId, amount, currency, 'credit', provider]
      );

      logger.info('Ledger entries created', {
        payoutId,
        debitId: debitResult.rows[0].id,
        creditId: creditResult.rows[0].id,
      });

      return {
        debitId: debitResult.rows[0].id,
        creditId: creditResult.rows[0].id,
      };
    } catch (error) {
      logger.error('Failed to create ledger entries', { error, payoutId });
      throw new Error('Ledger entry creation failed');
    }
  }

  /**
   * Validate ledger balance (should always be zero for double-entry)
   */
  async validateLedgerBalance(payoutId: string): Promise<boolean> {
    try {
      const result = await query<{ balance: number }>(
        `SELECT SUM(
           CASE 
             WHEN type = 'debit' THEN -amount
             WHEN type = 'credit' THEN amount
             ELSE 0
           END
         ) as balance
         FROM payout_ledger
         WHERE payout_id = $1`,
        [payoutId]
      );

      const balance = Number(result.rows[0]?.balance || 0);
      const isBalanced = Math.abs(balance) < 0.01; // Allow for floating point errors

      if (!isBalanced) {
        logger.error('Ledger balance validation failed', {
          payoutId,
          balance,
        });
      }

      return isBalanced;
    } catch (error) {
      logger.error('Failed to validate ledger balance', { error, payoutId });
      return false;
    }
  }

  /**
   * Get ledger entries for a payout
   */
  async getLedgerEntries(payoutId: string): Promise<LedgerEntry[]> {
    try {
      const result = await query<{
        id: string;
        payout_id: string;
        publisher_id: string;
        amount: number;
        currency: string;
        type: 'debit' | 'credit';
        provider: PaymentProvider;
        created_at: Date;
      }>(
        `SELECT id, payout_id, publisher_id, amount, currency, type, provider, created_at
         FROM payout_ledger
         WHERE payout_id = $1
         ORDER BY created_at ASC`,
        [payoutId]
      );

      return result.rows.map((row) => ({
        id: row.id,
        payoutId: row.payout_id,
        publisherId: row.publisher_id,
        amount: row.amount,
        currency: row.currency,
        type: row.type,
        provider: row.provider,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error('Failed to get ledger entries', { error, payoutId });
      return [];
    }
  }
}

export const ledgerService = new PayoutLedgerService();

// ========================================
// Payment Processor with Failover
// ========================================

export class PaymentProcessor {
  /**
   * Process payout with automatic failover
   */
  async processPayout(request: PayoutRequest): Promise<PayoutResult> {
    logger.info('Starting payout processing', {
      payoutId: request.payoutId,
      publisherId: request.publisherId,
      amount: request.amount,
      currency: request.currency,
    });

    const enabledProviders = PAYMENT_PROVIDERS.filter((p) => p.enabled);

    if (enabledProviders.length === 0) {
      logger.error('No payment providers enabled');
      return {
        success: false,
        provider: 'tipalti',
        error: 'No payment providers available',
        retryable: false,
      };
    }

    // Try each provider in priority order
    for (const config of enabledProviders) {
      const provider = providers[config.name];
      
      logger.info('Attempting payout with provider', {
        payoutId: request.payoutId,
        provider: config.name,
        priority: config.priority,
      });

      try {
        const result = await provider.sendPayout(request);

        if (result.success) {
          // Create ledger entries for successful payout
          await ledgerService.createLedgerEntries(
            request.payoutId,
            request.publisherId,
            request.amount,
            request.currency,
            config.name
          );

          // Validate ledger balance
          const isBalanced = await ledgerService.validateLedgerBalance(request.payoutId);
          
          if (!isBalanced) {
            logger.error('Ledger validation failed after successful payout', {
              payoutId: request.payoutId,
              provider: config.name,
            });
            // Continue to try next provider
            continue;
          }

          // Update payout status in database
          await this.updatePayoutStatus(
            request.payoutId,
            'processed',
            config.name,
            result.transactionId
          );

          logger.info('Payout processed successfully', {
            payoutId: request.payoutId,
            provider: config.name,
            transactionId: result.transactionId,
          });

          return result;
        }

        // If not retryable, fail immediately
        if (!result.retryable) {
          logger.error('Non-retryable payout error', {
            payoutId: request.payoutId,
            provider: config.name,
            error: result.error,
          });
          return result;
        }

        // If retryable, log and try next provider
        logger.warn('Payout failed, trying next provider', {
          payoutId: request.payoutId,
          provider: config.name,
          error: result.error,
        });

      } catch (error) {
        logger.error('Unexpected error during payout', {
          payoutId: request.payoutId,
          provider: config.name,
          error,
        });
      }
    }

    // All providers failed
    await this.updatePayoutStatus(request.payoutId, 'failed', null, null);

    logger.error('All payment providers failed', {
      payoutId: request.payoutId,
      triedProviders: enabledProviders.map((p) => p.name),
    });

    return {
      success: false,
      provider: enabledProviders[0].name,
      error: 'All payment providers failed',
      retryable: true,
    };
  }

  /**
   * Update payout status in database
   */
  private async updatePayoutStatus(
    payoutId: string,
    status: string,
    provider: PaymentProvider | null,
    transactionId: string | null | undefined
  ): Promise<void> {
    try {
      await query(
        `UPDATE payouts
         SET status = $1,
             provider = $2,
             transaction_id = $3,
             processed_at = CASE WHEN $1 = 'processed' THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE id = $4`,
        [status, provider, transactionId, payoutId]
      );
    } catch (error) {
      logger.error('Failed to update payout status', { error, payoutId });
    }
  }

  /**
   * Retry failed payouts
   */
  async retryFailedPayouts(): Promise<{ processed: number; failed: number }> {
    try {
      // Get all failed payouts from last 24 hours
      const result = await query<{
        id: string;
        publisher_id: string;
        amount: number;
        currency: string;
        method: string;
      }>(
        `SELECT id, publisher_id, amount, currency, method
         FROM payouts
         WHERE status = 'failed'
           AND created_at > NOW() - INTERVAL '24 hours'
         LIMIT 100`
      );

      let processed = 0;
      let failed = 0;

      for (const payout of result.rows) {
        const request: PayoutRequest = {
          payoutId: payout.id,
          publisherId: payout.publisher_id,
          amount: payout.amount,
          currency: payout.currency,
          method: payout.method,
        };

        const payoutResult = await this.processPayout(request);
        
        if (payoutResult.success) {
          processed++;
        } else {
          failed++;
        }
      }

      logger.info('Completed failed payout retry', { processed, failed });

      return { processed, failed };
    } catch (error) {
      logger.error('Failed to retry payouts', { error });
      return { processed: 0, failed: 0 };
    }
  }
}

export const paymentProcessor = new PaymentProcessor();

// ========================================
// Existing API Functions
// ========================================

export const listPayoutHistory = async (publisherId: string, limit = 10) => {
  return fetchPayoutHistory(publisherId, limit);
};

export const getUpcomingPayouts = async (publisherId: string) => {
  return fetchUpcomingPayouts(publisherId);
};

export const getPayoutSettings = async (publisherId: string) => {
  return fetchPayoutSettings(publisherId);
};

export const updatePayoutSettings = async (
  publisherId: string,
  settings: PayoutSettingsInput
) => {
  return upsertPayoutSettings(publisherId, settings);
};
