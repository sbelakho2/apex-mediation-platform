import { bidLandscapeService } from '../bidLandscapeService';
import type { OpenRTBBidRequest } from '../../types/openrtb.types';
import { insertMany, query } from '../../utils/postgres';

jest.mock('../../utils/postgres', () => ({
  insertMany: jest.fn(),
  query: jest.fn(),
}));

type MockQueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
};

const mockedInsertMany = insertMany as jest.MockedFunction<typeof insertMany>;
const mockedQuery = query as jest.MockedFunction<typeof query>;

const baseRequest = {
  id: 'auction-123',
  site: {
    id: 'site-1',
    publisher: { id: 'pub-1' },
  },
  imp: [
    {
      id: 'imp-1',
      tagid: 'placement-1',
      bidfloor: 0.05,
      bidfloorcur: 'usd',
    },
  ],
} as unknown as OpenRTBBidRequest;

beforeEach(() => {
  jest.clearAllMocks();
  mockedInsertMany.mockResolvedValue();
  mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as MockQueryResult as any);
});

describe('BidLandscapeService.logAuction', () => {
  it('persists bid rows via Postgres staging tables', async () => {
    const request = { ...baseRequest };
    const result = {
      success: true,
      response: {
        seatbid: [
          {
            bid: [
              {
                id: 'bid-1',
                impid: 'imp-1',
                price: 1.23,
              },
            ],
          },
        ],
      },
      metrics: {
        totalBids: 2,
        auctionDuration: 120,
        adapterResponses: 2,
        adapterTimeouts: 0,
        adapterErrors: 0,
      },
      allBids: [
        {
          adapter: { id: 'adapter-a', name: 'Adapter A' },
          bid: {
            id: 'bid-1',
            impid: 'imp-1',
            price: 1.23,
            adomain: ['example.com'],
            crid: 'creative-1',
          },
        },
        {
          adapter: { id: 'adapter-b', name: 'Adapter B' },
          bid: {
            impid: 'imp-1',
            price: 0.87,
            cid: 'creative-2',
          },
        },
      ],
    };

    await bidLandscapeService.logAuction(request, result as any);

    expect(mockedInsertMany).toHaveBeenCalledTimes(1);
    const [, columns, rows] = mockedInsertMany.mock.calls[0];
    expect(columns).toContain('adapter_id');
    expect(rows).toHaveLength(2);
    expect(rows[0][columns.indexOf('adapter_id')]).toBe('adapter-a');
    expect(mockedQuery.mock.calls[0][0]).toContain('INSERT INTO "analytics_bid_landscape"');
    expect(mockedQuery.mock.calls[1][0]).toContain('TRUNCATE "analytics_bid_landscape_stage"');
  });

  it('records no-bid auctions with placeholder rows', async () => {
    const request = { ...baseRequest };
    const result = {
      success: false,
      response: {},
      metrics: {
        totalBids: 0,
        auctionDuration: 80,
        adapterResponses: 0,
        adapterTimeouts: 2,
        adapterErrors: 0,
      },
      allBids: [],
    };

    await bidLandscapeService.logAuction(request, result as any);

    const [, columns, rows] = mockedInsertMany.mock.calls[0];
    const adapterIdx = columns.indexOf('adapter_id');
    const bidIdIdx = columns.indexOf('bid_id');
    expect(rows).toHaveLength(1);
    expect(rows[0][adapterIdx]).toBe('none');
    expect(rows[0][bidIdIdx]).toContain('no-bid');
  });
});

describe('BidLandscapeService.read models', () => {
  it('fetches publisher bid landscape from replica pool', async () => {
    const mockRows = [{ adapter_name: 'Adapter A', total_bids: 5 }];
    mockedQuery.mockResolvedValue({ rows: mockRows, rowCount: mockRows.length } as MockQueryResult as any);

    const start = new Date('2025-12-01T00:00:00Z');
    const end = new Date('2025-12-02T00:00:00Z');

    const rows = await bidLandscapeService.getPublisherBidLandscape('pub-1', start, end);

    expect(rows).toEqual(mockRows);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('analytics_bid_landscape'),
      ['pub-1', start, end],
      expect.objectContaining({ replica: true, label: 'BID_LANDSCAPE_PUBLISHER' })
    );
  });

  it('fetches timeline aggregations from replica pool', async () => {
    const mockRows = [{ time_bucket: new Date('2025-12-01T12:00:00Z') }];
    mockedQuery.mockResolvedValue({ rows: mockRows, rowCount: mockRows.length } as MockQueryResult as any);

    const start = new Date('2025-12-01T00:00:00Z');
    const end = new Date('2025-12-02T00:00:00Z');

    const rows = await bidLandscapeService.getAuctionTimeline('pub-1', start, end, 30);

    expect(rows).toEqual(mockRows);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('analytics_bid_landscape'),
      ['pub-1', start, end, 30],
      expect.objectContaining({ replica: true, label: 'BID_LANDSCAPE_TIMELINE' })
    );
  });
});
