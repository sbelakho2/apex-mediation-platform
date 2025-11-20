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
  countPayoutHistory: jest.fn(),
}));

import {
  fetchPayoutHistory,
  fetchUpcomingPayouts,
  fetchPayoutSettings,
  upsertPayoutSettings,
  countPayoutHistory,
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
const countMock = jest.mocked(countPayoutHistory);

describe('payoutProcessor service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retrieves payout history with pagination', async () => {
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
    countMock.mockResolvedValue(12);

    const result = await listPayoutHistory(publisherId, 2, 5);

    expect(historyMock).toHaveBeenCalledWith(publisherId, 5, 5);
    expect(countMock).toHaveBeenCalledWith(publisherId);
    expect(result).toEqual({
      items: rows,
      total: 12,
      page: 2,
      pageSize: 5,
      hasMore: true,
    });
  });

  it('returns upcoming payouts for publisher', async () => {
    const upcoming: PayoutHistoryRow = {
      id: 'next',
      amount: 1000,
      currency: 'USD',
      status: 'pending',
      method: 'wire',
      scheduledFor: '2024-05-10T00:00:00.000Z',
    };
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
      accountName: 'Main Account',
      accountReference: '****1234',
      autoPayout: false,
      backupMethod: undefined,
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
      accountName: 'Wire Account',
      accountReference: '****9876',
      autoPayout: true,
      backupMethod: 'stripe',
    };
    upsertMock.mockResolvedValue({
      threshold: input.threshold,
      method: input.method,
      currency: input.currency,
      schedule: input.schedule,
      accountName: input.accountName,
      accountReference: input.accountReference,
      autoPayout: input.autoPayout,
      backupMethod: input.backupMethod,
      updatedAt: '2024-05-01T00:00:00.000Z',
    });

    const updated = await updatePayoutSettings(publisherId, input);

    expect(upsertMock).toHaveBeenCalledWith(publisherId, input);
    expect(updated).toEqual({
      threshold: input.threshold,
      method: input.method,
      currency: input.currency,
      schedule: input.schedule,
      accountName: input.accountName,
      accountReference: input.accountReference,
      autoPayout: input.autoPayout,
      backupMethod: input.backupMethod,
      updatedAt: '2024-05-01T00:00:00.000Z',
    });
  });
});
