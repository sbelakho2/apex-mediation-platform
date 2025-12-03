import { generateKeyPairSync } from 'crypto';
import type { Bid, OpenRTBBidRequest, OpenRTBBidResponse } from '../src/types/openrtb.types';
import type { AuctionResult } from '../src/services/openrtbEngine';
import { TransparencyWriter, type TransparencyStorage } from '../src/services/transparencyWriter';
import { promRegister } from '../src/utils/prometheus';

type InsertBehavior =
  | { type: 'resolve' }
  | { type: 'reject'; error: Error & { statusCode?: number; code?: string } };

class SequenceStorage implements TransparencyStorage {
  private queue: InsertBehavior[] = [];

  public enqueue(...behaviors: InsertBehavior[]) {
    this.queue.push(...behaviors);
  }

  private async handle(kind: 'auctions' | 'candidates'): Promise<void> {
    const behavior = this.queue.shift();
    if (!behavior) {
      throw new Error(`SequenceStorage: unexpected ${kind} insert call with no configured behavior`);
    }
    if (behavior.type === 'resolve') {
      return;
    }
    throw behavior.error;
  }

  async insertAuctions(_rows: ReadonlyArray<unknown>): Promise<void> {
    await this.handle('auctions');
  }

  async insertCandidates(_rows: ReadonlyArray<unknown>): Promise<void> {
    await this.handle('candidates');
  }
}

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

function makeAuctionResult(winnerBid: Bid, response: OpenRTBBidResponse): AuctionResult {
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
  } as AuctionResult;
}

function transientError(statusCode: number): Error & { statusCode: number } {
  const error = new Error(`Storage transient ${statusCode}`) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function nonTransientError(statusCode: number): Error & { statusCode: number } {
  const error = new Error(`Storage non-transient ${statusCode}`) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

async function main() {
  promRegister.resetMetrics();

  const { privateKey } = generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  const storage = new SequenceStorage();
  let currentTime = Date.now();
  const writer = new TransparencyWriter({
    storage,
    samplingBps: 10000,
    privateKeySource: privateKeyPem,
    keyId: 'dev-test-key',
    aletheiaFeeBp: 150,
    retryAttempts: 1,
    retryMinDelayMs: 0,
    retryMaxDelayMs: 0,
    breakerThreshold: 2,
    breakerCooldownMs: 1000,
    nowProvider: () => currentTime,
    randomProvider: () => 0.5,
  });

  const request = makeRequest();
  const winningBid = makeBid('alpha', 2.5);
  const result = makeAuctionResult(winningBid, makeResponse(winningBid));

  const logMetrics = (label: string) => {
    const metrics = writer.getMetrics();
    // eslint-disable-next-line no-console
    console.log(`\n=== ${label} ===`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(metrics, null, 2));
  };

  // Scenario 1: transient failure recovered by retry
  storage.enqueue(
    { type: 'reject', error: transientError(500) },
    { type: 'resolve' },
    { type: 'resolve' }
  );
  await writer.recordAuction(request, result, new Date(currentTime));
  logMetrics('After transient retry success');

  // Scenario 2: consecutive non-transient failures trigger breaker open
  storage.enqueue({ type: 'reject', error: nonTransientError(400) });
  try {
    await writer.recordAuction(request, result, new Date(currentTime));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('Expected failure #1 (non-transient):', (error as Error).message);
  }

  storage.enqueue({ type: 'reject', error: nonTransientError(400) });
  try {
    await writer.recordAuction(request, result, new Date(currentTime));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('Expected failure #2 (breaker should open):', (error as Error).message);
  }

  logMetrics('After breaker opened');

  // Scenario 3: breaker skips further writes until cooldown expires
  await writer.recordAuction(request, result, new Date(currentTime));
  logMetrics('Breaker skip (no new inserts expected)');

  currentTime += 1500;
  logMetrics('After cooldown elapsed');

  const promOutput = await promRegister.metrics();
  // eslint-disable-next-line no-console
  console.log('\n=== Prometheus metrics sample ===');
  // eslint-disable-next-line no-console
  console.log(promOutput);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Transparency metrics check failed:', error);
  process.exitCode = 1;
});
