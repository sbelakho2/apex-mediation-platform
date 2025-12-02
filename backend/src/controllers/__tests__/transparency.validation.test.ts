/**
 * Integration tests for transparency API input validation and includeCanonical feature
 */

import request from 'supertest';
import express from 'express';
import type { QueryResult, QueryResultRow } from 'pg';
import transparencyRouter from '../../routes/transparency.routes';
import { errorHandler } from '../../middleware/errorHandler';
import { query } from '../../utils/postgres';

jest.mock('../../utils/postgres', () => ({
  query: jest.fn(),
}));
jest.mock('../../services/transparencyWriter');

const mockQuery = query as jest.MockedFunction<typeof query>;

const mockAuctionRow = {
  auction_id: 'test-auction-123',
  observed_at: '2025-11-10T12:00:00Z',
  timestamp: '2025-11-10T12:00:00Z',
  publisher_id: 'pub-test-123',
  app_or_site_id: 'app-123',
  placement_id: 'place-123',
  surface_type: 'mobile_app',
  device_os: 'iOS',
  device_geo: 'US',
  att_status: 'authorized',
  tc_string_sha256: 'hash123',
  winner_source: 'AdMob',
  winner_bid_ecpm: 1.5,
  winner_gross_price: 1.5,
  winner_currency: 'USD',
  winner_reason: 'highest_bid',
  aletheia_fee_bp: 200,
  sample_bps: 10000,
  effective_publisher_share: 0.98,
  integrity_algo: 'ed25519',
  integrity_key_id: 'key-1',
  integrity_signature: 'sig123',
};

const defaultCandidateRows = [
  {
    auction_id: 'test-auction-123',
    source: 'Meta',
    bid_ecpm: 1.2,
    currency: 'USD',
    response_time_ms: 50,
    status: 'bid',
    metadata_hash: 'hash1',
  },
];

type ConfigureQueryOptions = {
  auctionRow?: typeof mockAuctionRow;
  candidateRows?: typeof defaultCandidateRows;
};

const configureQueryMock = (options: ConfigureQueryOptions = {}) => {
  const auctionRow = options.auctionRow ?? mockAuctionRow;
  const candidateRows = options.candidateRows ?? defaultCandidateRows;

  const asResult = <T extends QueryResultRow>(rows: T[]): QueryResult<T> => ({
    rows,
    rowCount: rows.length,
    command: '',
    oid: 0,
    fields: [],
  } as QueryResult<T>);

  mockQuery.mockReset();
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('COUNT(*)::bigint as total_sampled')) {
      return Promise.resolve(asResult([{ total_sampled: 100 }]));
    }
    if (sql.includes('winner_source as source')) {
      return Promise.resolve(asResult([{ source: 'AdMob', count: 5 }]));
    }
    if (sql.includes('avg(aletheia_fee_bp)')) {
      return Promise.resolve(asResult([{ avg_fee_bp: 200, publisher_share_avg: 0.98 }]));
    }
    if (sql.includes('FROM transparency_auction_candidates') && sql.includes('ANY($1::uuid[])')) {
      return Promise.resolve(asResult(candidateRows));
    }
    if (sql.includes('FROM transparency_auction_candidates') && !sql.includes('ANY($1::uuid[])')) {
      return Promise.resolve(asResult(candidateRows));
    }
    if (sql.includes('FROM transparency_auctions') && sql.includes('LIMIT 1')) {
      return Promise.resolve(asResult([auctionRow]));
    }
    if (sql.includes('FROM transparency_auctions')) {
      return Promise.resolve(asResult([auctionRow]));
    }
    return Promise.resolve(asResult([]));
  });
};

beforeEach(() => {
  configureQueryMock();
});

const app = express();
app.use(express.json());
app.use('/api/v1/transparency', transparencyRouter);
app.use(errorHandler);

// Mock authenticate middleware to inject test user
jest.mock('../../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    req.user = { publisherId: 'pub-test-123' };
    next();
  },
}));

// Enable transparency API
process.env.TRANSPARENCY_API_ENABLED = 'true';

describe('Transparency API Input Validation', () => {
  describe('GET /auctions - Query Parameter Validation', () => {

    it('should accept valid limit within bounds (1-500)', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/auctions?limit=100')
        .expect(200);
      
      expect(response.body.limit).toBe(100);
    });

    it('should reject limit < 1', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/auctions?limit=0')
        .expect(400);
      
      expect(response.body.error).toContain('limit');
      expect(response.body.error).toContain('between 1 and 500');
    });

    it('should reject limit > 500', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/auctions?limit=501')
        .expect(400);
      
      expect(response.body.error).toContain('limit');
      expect(response.body.error).toContain('between 1 and 500');
    });

    it('should reject non-integer limit', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/auctions?limit=abc')
        .expect(400);
      
      expect(response.body.error).toContain('limit');
      expect(response.body.error).toContain('integer');
    });

    it('should accept valid page >= 1', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/auctions?page=5')
        .expect(200);
      
      expect(response.body.page).toBe(5);
    });

    it('should reject page < 1', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/auctions?page=0')
        .expect(400);
      
      expect(response.body.error).toContain('page');
    });

    it('should accept valid ISO8601 date formats', async () => {
      await request(app)
        .get('/api/v1/transparency/auctions?from=2025-11-10')
        .expect(200);
      
      await request(app)
        .get('/api/v1/transparency/auctions?from=2025-11-10T12:00:00Z')
        .expect(200);
      
      await request(app)
        .get('/api/v1/transparency/auctions?to=2025-11-10T12:00:00.123Z')
        .expect(200);
    });

    it('should reject invalid date formats', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/auctions?from=11/10/2025')
        .expect(400);
      
      expect(response.body.error).toContain('from');
      expect(response.body.error).toContain('ISO8601');
    });

    it('should reject invalid dates', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/auctions?from=2025-02-30')
        .expect(400);
      
      expect(response.body.error).toContain('from');
    });

    it('should accept valid sort fields', async () => {
      await request(app)
        .get('/api/v1/transparency/auctions?sort=timestamp')
        .expect(200);
      
      await request(app)
        .get('/api/v1/transparency/auctions?sort=winner_bid_ecpm')
        .expect(200);
      
      await request(app)
        .get('/api/v1/transparency/auctions?sort=aletheia_fee_bp')
        .expect(200);
    });

    it('should reject invalid sort fields', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/auctions?sort=invalid_field')
        .expect(400);
      
      expect(response.body.error).toContain('sort');
      expect(response.body.error).toContain('timestamp');
    });

    it('should accept valid order values', async () => {
      await request(app)
        .get('/api/v1/transparency/auctions?order=asc')
        .expect(200);
      
      await request(app)
        .get('/api/v1/transparency/auctions?order=desc')
        .expect(200);
    });

    it('should reject invalid order values', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/auctions?order=invalid')
        .expect(400);
      
      expect(response.body.error).toContain('order');
      expect(response.body.error).toContain('asc');
      expect(response.body.error).toContain('desc');
    });
  });

  describe('GET /auctions/:id - includeCanonical Feature', () => {

    it('should not include canonical by default', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/auctions/test-auction-123')
        .expect(200);
      
      expect(response.body.canonical).toBeUndefined();
    });

    it('should include canonical when includeCanonical=true', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/auctions/test-auction-123?includeCanonical=true')
        .expect(200);
      
      expect(response.body.canonical).toBeDefined();
      expect(response.body.canonical.string).toBeDefined();
      expect(response.body.canonical.truncated).toBe(false);
      expect(response.body.canonical.size_bytes).toBeGreaterThan(0);
    });

    it('should accept various boolean formats for includeCanonical', async () => {
      const formats = ['true', '1', 'yes', 'TRUE', 'YES'];
      
      for (const format of formats) {
        const response = await request(app)
          .get(`/api/v1/transparency/auctions/test-auction-123?includeCanonical=${format}`)
          .expect(200);
        
        expect(response.body.canonical).toBeDefined();
      }
    });

    it('should reject invalid boolean values for includeCanonical', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/auctions/test-auction-123?includeCanonical=invalid')
        .expect(400);
      
      expect(response.body.error).toContain('includeCanonical');
      expect(response.body.error).toContain('boolean');
    });

    it('should mark truncated=true when canonical exceeds 32KB', async () => {
      // Mock a very large canonical string
      const largeMockRow = {
        ...mockAuctionRow,
        winner_source: 'A'.repeat(100000), // Force large canonical
      };
      
      const candidates = Array.from({ length: 1000 }, (_, i) => ({
        auction_id: 'test-auction-123',
        source: `Source${i}`,
        bid_ecpm: 1.0,
        currency: 'USD',
        response_time_ms: 50,
        status: 'bid',
        metadata_hash: `hash${i}`,
      }));
      configureQueryMock({ auctionRow: largeMockRow, candidateRows: candidates });

      const response = await request(app)
        .get('/api/v1/transparency/auctions/test-auction-123?includeCanonical=true')
        .expect(200);
      
      expect(response.body.canonical).toBeDefined();
      expect(response.body.canonical.truncated).toBe(true);
      expect(response.body.canonical.string.length).toBe(32 * 1024); // 32KB cap
      expect(response.body.canonical.size_bytes).toBeGreaterThan(32 * 1024);
    });
  });

  describe('GET /summary/auctions - Date Validation', () => {

    it('should accept valid from and to dates', async () => {
      await request(app)
        .get('/api/v1/transparency/summary/auctions?from=2025-11-01&to=2025-11-10')
        .expect(200);
    });

    it('should reject invalid from date', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/summary/auctions?from=invalid')
        .expect(400);
      
      expect(response.body.error).toContain('from');
    });

    it('should reject invalid to date', async () => {
      const response = await request(app)
        .get('/api/v1/transparency/summary/auctions?to=2025/11/10')
        .expect(400);
      
      expect(response.body.error).toContain('to');
    });
  });
});
