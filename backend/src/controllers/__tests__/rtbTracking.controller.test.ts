import { trackImpression } from '../rtbTracking.controller';
import type { Request, Response } from 'express';
import { verifyToken } from '../../utils/signing';
import { queueManager } from '../../queues/queueManager';
import { query as pgQuery } from '../../utils/postgres';

jest.mock('../../utils/signing', () => ({
  verifyToken: jest.fn(),
}));

jest.mock('../../utils/postgres', () => {
  const actual = jest.requireActual('../../utils/postgres');
  return {
    ...actual,
    query: jest.fn(),
  };
});

jest.mock('../../queues/queueManager', () => {
  const actual = jest.requireActual('../../queues/queueManager');
  return {
    ...actual,
    queueManager: {
      ...actual.queueManager,
      isReady: jest.fn().mockReturnValue(false),
      getQueue: jest.fn(),
    },
    QueueName: actual.QueueName,
  };
});

describe('rtbTracking.controller', () => {
  const mockResponse = () => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  const baseClaims = {
    bidId: 'bid-123456',
    placementId: 'placement-456',
    adapter: 'unity',
    cpm: 1.23,
    currency: 'USD' as const,
    purpose: 'imp' as const,
    nonce: 'nonce-999',
    exp: Date.now() + 600,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (verifyToken as jest.Mock).mockReturnValue(baseClaims);
    (queueManager.isReady as jest.Mock).mockReturnValue(false);
  });

  it('writes tracking events directly to Postgres when the analytics queue is unavailable', async () => {
    (pgQuery as jest.Mock).mockResolvedValue({});

    const headerGetter = ((name: string) => {
      if (name === 'set-cookie') {
        return [];
      }
      return name === 'user-agent' ? 'UnitTestUA/1.0' : undefined;
    }) as Request['get'];

    const req: Partial<Request> = {
      query: { token: 'signed-token' },
      ip: '203.0.113.5',
      get: headerGetter,
      headers: {},
    };

    const res = mockResponse();

    await trackImpression(req as Request, res);

    expect(pgQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO rtb_tracking_events'),
      expect.arrayContaining([
        'imp',
        baseClaims.bidId,
        baseClaims.placementId,
        baseClaims.adapter,
      ])
    );
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
