import axios from 'axios';
import { Pool } from 'pg';
import logger from '../utils/logger';

export interface FxRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  date: Date;
  source: string;
}

export interface FxNormalizationResult {
  originalAmount: number;
  originalCurrency: string;
  normalizedAmount: number;
  normalizedCurrency: string;
  rate: number;
  date: Date;
}

/**
 * FX Normalization Service
 * 
 * Fetches and caches FX rates from ECB for billing invoice generation
 * Converts amounts between currencies using daily ECB rates
 * Caches rates in database to reduce API calls
 */
export class FxNormalizationService {
  private static readonly ECB_API_URL =
    'https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A';
  private static readonly DEFAULT_BASE_CURRENCY = 'EUR';
  private static readonly CACHE_TTL_HOURS = 24;

  constructor(private pool: Pool) {}

  /**
   * Fetch latest FX rates from ECB API
   */
  async fetchLatestRates(): Promise<FxRate[]> {
    try {
      logger.info('Fetching latest FX rates from ECB');

      const response = await axios.get(FxNormalizationService.ECB_API_URL, {
        headers: {
          Accept: 'application/json',
        },
        params: {
          format: 'jsondata',
          lastNObservations: 1,
        },
        timeout: 10000,
      });

      const rates: FxRate[] = [];
      const observations = response.data?.dataSets?.[0]?.series || {};

      for (const [key, series] of Object.entries(observations)) {
        const seriesData = series as any;
        const observation = seriesData.observations?.['0'];
        if (!observation) continue;

        // Extract currency from key (format: "0:3:D:...")
        const keyParts = key.split(':');
        if (keyParts.length < 4) continue;

        const currencyIndex = parseInt(keyParts[1]);
        const structure = response.data?.structure?.dimensions?.series;
        const currencyDimension = structure?.find((d: any) => d.id === 'CURRENCY');
        const currency = currencyDimension?.values?.[currencyIndex]?.id;

        if (!currency || currency === 'EUR') continue;

        const rate = observation[0];
        const dateStr = response.data?.structure?.dimensions?.observation?.[0]?.values?.[0]?.id;

        rates.push({
          fromCurrency: currency,
          toCurrency: FxNormalizationService.DEFAULT_BASE_CURRENCY,
          rate: parseFloat(rate),
          date: dateStr ? new Date(dateStr) : new Date(),
          source: 'ECB',
        });
      }

      logger.info(`Fetched ${rates.length} FX rates from ECB`);
      return rates;
    } catch (error) {
      logger.error('Failed to fetch FX rates from ECB', { error });
      throw new Error(`ECB API error: ${(error as Error).message}`);
    }
  }

  /**
   * Store FX rates in database cache
   */
  async cacheRates(rates: FxRate[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const rate of rates) {
        await client.query(
          `INSERT INTO fx_rates 
           (from_currency, to_currency, rate, rate_date, source, created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '${FxNormalizationService.CACHE_TTL_HOURS} hours')
           ON CONFLICT (from_currency, to_currency, rate_date) 
           DO UPDATE SET rate = $3, updated_at = NOW()`,
          [rate.fromCurrency, rate.toCurrency, rate.rate, rate.date, rate.source]
        );
      }

      await client.query('COMMIT');
      logger.info(`Cached ${rates.length} FX rates`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to cache FX rates', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get FX rate from cache or fetch if expired
   */
  async getRate(
    fromCurrency: string,
    toCurrency: string = FxNormalizationService.DEFAULT_BASE_CURRENCY,
    date?: Date
  ): Promise<number> {
    // Same currency, no conversion needed
    if (fromCurrency === toCurrency) {
      return 1.0;
    }

    const targetDate = date || new Date();

    const client = await this.pool.connect();
    try {
      // Try to get from cache
      const result = await client.query(
        `SELECT rate FROM fx_rates
         WHERE from_currency = $1 
         AND to_currency = $2 
         AND rate_date::date = $3::date
         AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`,
        [fromCurrency, toCurrency, targetDate]
      );

      if (result.rows.length > 0) {
        return parseFloat(result.rows[0].rate);
      }

      // Cache miss - fetch latest rates
      logger.info('FX rate cache miss, fetching from ECB', {
        fromCurrency,
        toCurrency,
        date: targetDate,
      });

      const rates = await this.fetchLatestRates();
      await this.cacheRates(rates);

      // Try again from cache
      const retryResult = await client.query(
        `SELECT rate FROM fx_rates
         WHERE from_currency = $1 
         AND to_currency = $2 
         AND rate_date::date = $3::date
         ORDER BY created_at DESC
         LIMIT 1`,
        [fromCurrency, toCurrency, targetDate]
      );

      if (retryResult.rows.length > 0) {
        return parseFloat(retryResult.rows[0].rate);
      }

      throw new Error(
        `No FX rate found for ${fromCurrency} to ${toCurrency} on ${targetDate.toISOString()}`
      );
    } finally {
      client.release();
    }
  }

  /**
   * Normalize amount to base currency (EUR)
   */
  async normalize(
    amount: number,
    fromCurrency: string,
    date?: Date
  ): Promise<FxNormalizationResult> {
    const toCurrency = FxNormalizationService.DEFAULT_BASE_CURRENCY;
    const targetDate = date || new Date();

    if (fromCurrency === toCurrency) {
      return {
        originalAmount: amount,
        originalCurrency: fromCurrency,
        normalizedAmount: amount,
        normalizedCurrency: toCurrency,
        rate: 1.0,
        date: targetDate,
      };
    }

    const rate = await this.getRate(fromCurrency, toCurrency, targetDate);
    const normalizedAmount = amount / rate; // Rate is FROM/EUR, so divide to get EUR

    return {
      originalAmount: amount,
      originalCurrency: fromCurrency,
      normalizedAmount: parseFloat(normalizedAmount.toFixed(2)),
      normalizedCurrency: toCurrency,
      rate,
      date: targetDate,
    };
  }

  /**
   * Convert amount from one currency to another
   */
  async convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    date?: Date
  ): Promise<number> {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    const targetDate = date || new Date();

    // First convert to EUR base
    const toEur = await this.normalize(amount, fromCurrency, targetDate);

    // Then convert from EUR to target currency
    if (toCurrency === FxNormalizationService.DEFAULT_BASE_CURRENCY) {
      return toEur.normalizedAmount;
    }

    const eurToTarget = await this.getRate(toCurrency, 'EUR', targetDate);
    const converted = toEur.normalizedAmount * eurToTarget;

    return parseFloat(converted.toFixed(2));
  }

  /**
   * Purge expired FX rates from cache
   */
  async purgeExpiredRates(): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `DELETE FROM fx_rates WHERE expires_at < NOW() RETURNING id`
      );

      const count = result.rowCount || 0;
      logger.info(`Purged ${count} expired FX rates`);
      return count;
    } finally {
      client.release();
    }
  }

  /**
   * Get supported currencies
   */
  async getSupportedCurrencies(): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT DISTINCT from_currency FROM fx_rates 
         WHERE expires_at > NOW()
         ORDER BY from_currency`
      );

      return result.rows.map((r: any) => r.from_currency);
    } finally {
      client.release();
    }
  }

  /**
   * Refresh rates cache (call this via cron daily)
   */
  async refreshRatesCache(): Promise<void> {
    try {
      logger.info('Starting FX rates cache refresh');
      const rates = await this.fetchLatestRates();
      await this.cacheRates(rates);
      await this.purgeExpiredRates();
      logger.info('FX rates cache refresh completed');
    } catch (error) {
      logger.error('FX rates cache refresh failed', { error });
      throw error;
    }
  }
}
