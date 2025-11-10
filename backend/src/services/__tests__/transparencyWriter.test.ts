import { describe, expect, it, jest } from '@jest/globals';
import type { MockedFunction } from 'jest-mock';
import { generateKeyPairSync } from 'crypto';
import type { OpenRTBBidRequest, OpenRTBBidResponse, Bid } from '../../types/openrtb.types';
import {
  TransparencyWriter,
  buildTransparencySignaturePayload,
  canonicalizeForSignature,
  type ClickHouseClient,
  type ClickHouseInsertArgs,
} from '../transparencyWriter';

function makeRequest(): OpenRTBBidRequest {
  return {
    id: 'req-123',
    imp: [
      {
        id: 'imp-1',
        tagid: 'placement-001',
        bidfloor: 1.5,
        bidfloorcur: 'USD',
      },
    ],
    device: {
      os: 'iOS',
      geo: {
        country: 'US',
      },
    },
    app: {
      id: 'app-1',
      publisher: {
        id: 'pub-42',
      },
    },
  };
}

function makeBid(adapterId: string, price: number): Bid {
  return {
    id: `${adapterId}-bid`,
    impid: 'imp-1',
    price,
    crid: `${adapterId}-creative`,
    adomain: ['example.com'],
    cid: `${adapterId}-cid`,
  };
}

function makeResponse(bid: Bid): OpenRTBBidResponse {
  return {
    id: 'resp-1',
    seatbid: [
      {
        seat: 'adapter-seat',
        bid: [bid],
      },
    ],
    cur: 'USD',
  };
}

function makeAuctionResult(winnerBid: Bid, response: OpenRTBBidResponse) {
  return {
    success: true,
    response,
    metrics: {
      auctionDuration: 12,
      totalBids: 2,
      adapterResponses: 1,
      adapterTimeouts: 0,
      adapterErrors: 0,
    },
    allBids: [
      {
        adapter: { id: 'alpha', name: 'AlphaDSP' },
        bid: winnerBid,
      },
      {
        adapter: { id: 'beta', name: 'BetaDSP' },
        bid: makeBid('beta', 1.1),
      },
    ],
  };
}

describe('TransparencyWriter', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  function makeWriter(
    overrides: Partial<ConstructorParameters<typeof TransparencyWriter>[0]> = {}
  ): {
    writer: TransparencyWriter;
    insertMock: MockedFunction<(args: ClickHouseInsertArgs) => Promise<void>>;
  } {
    const insertMock: MockedFunction<(args: ClickHouseInsertArgs) => Promise<void>> = jest.fn(async (_args) => {});
    const client: ClickHouseClient = overrides.client ?? ({ insert: insertMock } as ClickHouseClient);

    const defaultOptions = {
      samplingBps: 10000,
      privateKeySource: privateKeyPem,
      keyId: 'test-key',
      aletheiaFeeBp: 150,
    } satisfies Partial<ConstructorParameters<typeof TransparencyWriter>[0]>;

    const writer = new TransparencyWriter({
      ...defaultOptions,
      ...overrides,
      client,
    });

    return { writer, insertMock };
  }

  it('skips writes when sampling does not select the auction', async () => {
    const { writer, insertMock } = makeWriter({ samplingBps: 0 });
    await writer.recordAuction(makeRequest(), makeAuctionResult(makeBid('alpha', 2.5), makeResponse(makeBid('alpha', 2.5))));
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('persists auction and candidate rows with a deterministic signature when sampling hits', async () => {
    const { writer, insertMock } = makeWriter();
    const request = makeRequest();
    const winningBid = makeBid('alpha', 2.75);
    const result = makeAuctionResult(winningBid, makeResponse(winningBid));

    await writer.recordAuction(request, result, new Date('2025-11-09T12:00:00.000Z'));

    expect(insertMock).toHaveBeenCalledTimes(2);
    const [[auctionArgs], [candidatesArgs]] = insertMock.mock.calls as Array<[ClickHouseInsertArgs]>;

    expect(auctionArgs.table).toBe('auctions');
    expect(Array.isArray(auctionArgs.values)).toBe(true);

    const auctionRow = auctionArgs.values[0] as Record<string, unknown>;
    expect(auctionRow.publisher_id).toBe('pub-42');
    expect(auctionRow.integrity_signature).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(auctionRow.integrity_algo).toBe('ed25519');
    expect(auctionRow.winner_source).toBe('alpha');

    expect(candidatesArgs.table).toBe('auction_candidates');
    expect(candidatesArgs.values).toHaveLength(2);
  });

  it('canonicalizes payload deterministically for signing', () => {
    const timestamp = '2025-11-09T12:34:56.000Z';
    const payload = buildTransparencySignaturePayload(
      {
        auction_id: 'a-1',
        timestamp,
        publisher_id: 'pub-1',
        app_or_site_id: 'app-1',
        placement_id: 'placement',
        surface_type: 'mobile_app',
        device_os: 'ios',
        device_geo: 'US',
        att_status: 'authorized',
        tc_string_sha256: '0'.repeat(64),
        winner_source: 'alpha',
        winner_bid_ecpm: 1.23,
        winner_gross_price: 0.99,
        winner_currency: 'USD',
        winner_reason: 'win',
        aletheia_fee_bp: 150,
        sample_bps: 500,
        effective_publisher_share: 0.985,
        integrity_algo: 'ed25519',
        integrity_key_id: 'test-key',
        integrity_signature: '',
      },
      [
        {
          auction_id: 'a-1',
          timestamp,
          source: 'alpha',
          bid_ecpm: 1.23,
          currency: 'USD',
          response_time_ms: 20,
          status: 'win',
          metadata_hash: 'abc',
        },
      ],
      500
    );

    const canonical = canonicalizeForSignature(payload);
    const parsed = JSON.parse(canonical);

    expect(parsed).toEqual({
      auction: {
        auction_id: 'a-1',
        publisher_id: 'pub-1',
        sample_bps: 500,
        timestamp,
        winner_bid_ecpm: 1.23,
        winner_currency: 'USD',
        winner_reason: 'win',
        winner_source: 'alpha',
      },
      candidates: [
        {
          bid_ecpm: 1.23,
          source: 'alpha',
          status: 'win',
        },
      ],
    });
  });
});