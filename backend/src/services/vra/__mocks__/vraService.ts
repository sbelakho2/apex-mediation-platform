import { jest } from '@jest/globals';

type OverviewResult = {
  coveragePercent: number;
  variancePercent: number;
  totals: { impressions: number; paid: number; expected: number };
  byBreakdown: Array<{
    network: string;
    format?: string;
    country?: string;
    impressions: number;
    paid: number;
    expected?: number;
  }>;
  byNetwork: Array<{ network: string; impressions: number; paid: number; expected: number }>;
};

type DeltasResult = {
  items: Array<Record<string, any>>;
  page: number;
  pageSize: number;
  total: number;
};

const defaultOverview: OverviewResult = {
  coveragePercent: 0,
  variancePercent: 0,
  totals: { impressions: 0, paid: 0, expected: 0 },
  byBreakdown: [],
  byNetwork: [],
};

const defaultDeltas: DeltasResult = {
  items: [],
  page: 1,
  pageSize: 100,
  total: 0,
};

const getOverview = jest.fn(async () => defaultOverview);
const getDeltas = jest.fn(async () => defaultDeltas);
const getMonthlyDigest = jest.fn(async () => null);

export class VraService {
  getOverview = getOverview;
  getDeltas = getDeltas;
  getMonthlyDigest = getMonthlyDigest;
}

export const vraService = {
  getOverview,
  getDeltas,
  getMonthlyDigest,
};

export default { VraService, vraService };
