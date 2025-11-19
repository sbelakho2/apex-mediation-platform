import { Pool } from 'pg';
import axios from 'axios';
import { FxNormalizationService } from '../fxNormalizationService';

// Mock dependencies
jest.mock('axios');
jest.mock('../../utils/logger');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FxNormalizationService', () => {
  let service: FxNormalizationService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: any;

  beforeEach(() => {
    // Setup mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    // Setup mock pool
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    } as any;

    service = new FxNormalizationService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchLatestRates', () => {
    it('should fetch rates from ECB API successfully', async () => {
      const mockECBResponse = {
        data: {
          dataSets: [
            {
              series: {
                '0:0:D::': {
                  observations: {
                    '0': [1.09, 'A'],
                  },
                },
                '0:1:D::': {
                  observations: {
                    '0': [0.86, 'A'],
                  },
                },
              },
            },
          ],
          structure: {
            dimensions: {
              series: [
                {
                  id: 'CURRENCY',
                  values: [
                    { id: 'USD' },
                    { id: 'GBP' },
                  ],
                },
              ],
              observation: [
                {
                  values: [
                    { id: '2025-11-19' },
                  ],
                },
              ],
            },
          },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockECBResponse);

      const rates = await service.fetchLatestRates();

      expect(rates).toHaveLength(2);
      expect(rates[0]).toMatchObject({
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        rate: 1.09,
        source: 'ECB',
      });
      expect(rates[1]).toMatchObject({
        fromCurrency: 'GBP',
        toCurrency: 'EUR',
        rate: 0.86,
        source: 'ECB',
      });
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { Accept: 'application/json' },
          timeout: 10000,
        })
      );
    });

    it('should throw error on API failure', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.fetchLatestRates()).rejects.toThrow('ECB API error');
    });

    it('should handle empty response', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: {} });

      const rates = await service.fetchLatestRates();

      expect(rates).toEqual([]);
    });
  });

  describe('cacheRates', () => {
    it('should store rates in database', async () => {
      const rates = [
        {
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          rate: 1.09,
          date: new Date('2025-11-19'),
          source: 'ECB',
        },
        {
          fromCurrency: 'GBP',
          toCurrency: 'EUR',
          rate: 0.86,
          date: new Date('2025-11-19'),
          source: 'ECB',
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT 1
        .mockResolvedValueOnce({ rows: [] }) // INSERT 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await service.cacheRates(rates);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO fx_rates'),
        expect.arrayContaining(['USD', 'EUR', 1.09])
      );
    });

    it('should rollback on error', async () => {
      const rates = [
        {
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          rate: 1.09,
          date: new Date(),
          source: 'ECB',
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB error')); // INSERT fails

      await expect(service.cacheRates(rates)).rejects.toThrow('DB error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getRate', () => {
    it('should return 1.0 for same currency', async () => {
      const rate = await service.getRate('EUR', 'EUR');
      expect(rate).toBe(1.0);
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('should return cached rate if available', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ rate: '1.09' }],
      });

      const rate = await service.getRate('USD', 'EUR');

      expect(rate).toBe(1.09);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT rate FROM fx_rates'),
        expect.arrayContaining(['USD', 'EUR'])
      );
    });

    it('should fetch from ECB on cache miss', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Cache miss
        .mockResolvedValueOnce({ rows: [] }) // BEGIN (cache)
        .mockResolvedValueOnce({ rows: [] }) // INSERT (cache)
        .mockResolvedValueOnce({ rows: [] }) // COMMIT (cache)
        .mockResolvedValueOnce({ rows: [{ rate: '1.09' }] }); // Retry SELECT

      const mockECBResponse = {
        data: {
          dataSets: [
            {
              series: {
                '0:0:D::': {
                  observations: {
                    '0': [1.09, 'A'],
                  },
                },
              },
            },
          ],
          structure: {
            dimensions: {
              series: [
                {
                  id: 'CURRENCY',
                  values: [{ id: 'USD' }],
                },
              ],
              observation: [
                {
                  values: [{ id: '2025-11-19' }],
                },
              ],
            },
          },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockECBResponse);

      const rate = await service.getRate('USD', 'EUR');

      expect(rate).toBe(1.09);
      expect(mockedAxios.get).toHaveBeenCalled();
    });

    it('should throw error if rate not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Cache miss
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // COMMIT
        .mockResolvedValueOnce({ rows: [] }); // Retry miss

      mockedAxios.get.mockResolvedValueOnce({ data: {} });

      await expect(service.getRate('XXX', 'EUR')).rejects.toThrow(
        'No FX rate found'
      );
    });
  });

  describe('normalize', () => {
    it('should return same amount for EUR', async () => {
      const result = await service.normalize(100, 'EUR');

      expect(result).toEqual({
        originalAmount: 100,
        originalCurrency: 'EUR',
        normalizedAmount: 100,
        normalizedCurrency: 'EUR',
        rate: 1.0,
        date: expect.any(Date),
      });
    });

    it('should normalize USD to EUR', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ rate: '1.09' }], // 1 USD = 1.09 EUR means EUR = USD / 1.09
      });

      const result = await service.normalize(109, 'USD');

      expect(result.originalAmount).toBe(109);
      expect(result.originalCurrency).toBe('USD');
      expect(result.normalizedAmount).toBe(100); // 109 / 1.09 = 100
      expect(result.normalizedCurrency).toBe('EUR');
      expect(result.rate).toBe(1.09);
    });

    it('should use specified date', async () => {
      const testDate = new Date('2025-11-15');

      mockClient.query.mockResolvedValueOnce({
        rows: [{ rate: '0.86' }],
      });

      const result = await service.normalize(86, 'GBP', testDate);

      expect(result.date).toEqual(testDate);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['GBP', 'EUR', testDate])
      );
    });
  });

  describe('convert', () => {
    it('should return same amount for same currency', async () => {
      const result = await service.convert(100, 'USD', 'USD');
      expect(result).toBe(100);
    });

    it('should convert USD to EUR', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ rate: '1.09' }],
      });

      const result = await service.convert(109, 'USD', 'EUR');

      expect(result).toBe(100); // 109 / 1.09 = 100
    });

    it('should convert USD to GBP via EUR', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ rate: '1.09' }] }) // USD to EUR
        .mockResolvedValueOnce({ rows: [{ rate: '0.86' }] }); // GBP to EUR (inverse for EUR to GBP)

      const result = await service.convert(109, 'USD', 'GBP');

      // 109 USD -> 100 EUR -> 100 * 0.86 = 86 GBP
      expect(result).toBe(86);
    });
  });

  describe('purgeExpiredRates', () => {
    it('should delete expired rates', async () => {
      mockClient.query.mockResolvedValueOnce({
        rowCount: 15,
        rows: [],
      });

      const count = await service.purgeExpiredRates();

      expect(count).toBe(15);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM fx_rates WHERE expires_at < NOW()')
      );
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return list of supported currencies', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { from_currency: 'GBP' },
          { from_currency: 'JPY' },
          { from_currency: 'USD' },
        ],
      });

      const currencies = await service.getSupportedCurrencies();

      expect(currencies).toEqual(['GBP', 'JPY', 'USD']);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT DISTINCT from_currency')
      );
    });

    it('should return empty array if no rates cached', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const currencies = await service.getSupportedCurrencies();

      expect(currencies).toEqual([]);
    });
  });

  describe('refreshRatesCache', () => {
    it('should fetch, cache, and purge rates', async () => {
      const mockECBResponse = {
        data: {
          dataSets: [
            {
              series: {
                '0:0:D::': {
                  observations: {
                    '0': [1.09, 'A'],
                  },
                },
              },
            },
          ],
          structure: {
            dimensions: {
              series: [
                {
                  id: 'CURRENCY',
                  values: [{ id: 'USD' }],
                },
              ],
              observation: [
                {
                  values: [{ id: '2025-11-19' }],
                },
              ],
            },
          },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockECBResponse);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }) // COMMIT
        .mockResolvedValueOnce({ rowCount: 5, rows: [] }); // Purge

      await service.refreshRatesCache();

      expect(mockedAxios.get).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM fx_rates')
      );
    });

    it('should throw error on failure', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('API error'));

      await expect(service.refreshRatesCache()).rejects.toThrow('ECB API error');
    });
  });
});
