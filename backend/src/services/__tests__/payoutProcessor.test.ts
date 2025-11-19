import type {
  PayoutHistoryRow,
  PayoutSettingsRow,
  PayoutSettingsInput,
} from '../../repositories/payoutRepository';

jest.mock('../../repositories/payoutRepository', () => ({
  fetchPayoutHistory: jest.fn(),
  fetchUpcomingPayouts: jest.fn(),
  fetchPayoutSettings: jest.fn(),
  upsertPayoutSettings: jest.fn(),
}));

import {
  fetchPayoutHistory,
  fetchUpcomingPayouts,
  fetchPayoutSettings,
  upsertPayoutSettings,
} from '../../repositories/payoutRepository';
import {
  listPayoutHistory,
  getUpcomingPayouts,
  getPayoutSettings,
  updatePayoutSettings,
} from '../payoutProcessor';

const publisherId = 'publisher-1';
const historyMock = jest.mocked(fetchPayoutHistory);
const upcomingMock = jest.mocked(fetchUpcomingPayouts);
const settingsMock = jest.mocked(fetchPayoutSettings);
const upsertMock = jest.mocked(upsertPayoutSettings);

describe('payoutProcessor service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retrieves payout history with provided limit', async () => {
    const rows: PayoutHistoryRow[] = [
      {
        id: '1',
        amount: 500,
        currency: 'USD',
        method: 'stripe',
        status: 'paid',
        scheduledFor: '2024-05-01T00:00:00.000Z',
        processedAt: '2024-05-02T00:00:00.000Z',
      },
    ];

    historyMock.mockResolvedValue(rows);

    const result = await listPayoutHistory(publisherId, 5);

    expect(historyMock).toHaveBeenCalledWith(publisherId, 5);
    expect(result).toBe(rows);
  });

  it('returns upcoming payouts for publisher', async () => {
    const upcoming: PayoutHistoryRow[] = [];
    upcomingMock.mockResolvedValue(upcoming);

    const result = await getUpcomingPayouts(publisherId);

    expect(upcomingMock).toHaveBeenCalledWith(publisherId);
    expect(result).toBe(upcoming);
  });

  it('provides payout settings and allows updates', async () => {
    const settings: PayoutSettingsRow = {
      threshold: 100,
      method: 'paypal',
      currency: 'USD',
      schedule: 'monthly',
      updatedAt: '2024-04-30T00:00:00.000Z',
    };

    settingsMock.mockResolvedValue(settings);

    const fetched = await getPayoutSettings(publisherId);

    expect(settingsMock).toHaveBeenCalledWith(publisherId);
    expect(fetched).toBe(settings);

    const input: PayoutSettingsInput = {
      threshold: 200,
      method: 'wire',
      currency: 'EUR',
      schedule: 'monthly',
    };
    upsertMock.mockResolvedValue({
      threshold: input.threshold,
      method: input.method,
      currency: input.currency,
      schedule: input.schedule,
      updatedAt: '2024-05-01T00:00:00.000Z',
    });

    const updated = await updatePayoutSettings(publisherId, input);

    expect(upsertMock).toHaveBeenCalledWith(publisherId, input);
    expect(updated).toEqual({
      threshold: input.threshold,
      method: input.method,
      currency: input.currency,
      schedule: input.schedule,
      updatedAt: '2024-05-01T00:00:00.000Z',
    });
  });
});
