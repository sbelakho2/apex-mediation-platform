import { Request, Response } from 'express';
import { AppError } from '../../middleware/errorHandler';

const ingestFromCSVMock = jest.fn();
const ingestFromAPIMock = jest.fn();
const unityIngestFromAPIMock = jest.fn();
const getCredentialsMock = jest.fn();

jest.mock('../../utils/postgres', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../services/admobReportIngestionService', () => ({
  createAdMobReportIngestionService: jest.fn(() => ({
    ingestFromCSV: ingestFromCSVMock,
    ingestFromAPI: ingestFromAPIMock,
  })),
}));

jest.mock('../../services/unityReportIngestionService', () => ({
  createUnityReportIngestionService: jest.fn(() => ({
    ingestFromAPI: unityIngestFromAPIMock,
  })),
}));

jest.mock('../../services/networkCredentialVault', () => ({
  NetworkCredentialVaultService: jest.fn().mockImplementation(() => ({
    getCredentials: getCredentialsMock,
  })),
}));

// Import after mocks so the controllers receive mocked dependencies
import { ingestAdmobCsv, ingestAdmobApi, ingestUnityApi } from '../byoIngestion.controller';

describe('BYO ingestion controller', () => {
  const publisherId = 'pub-abc';
  const baseResult = {
    success: true,
    rowsProcessed: 10,
    rowsInserted: 10,
    rowsSkipped: 0,
    errors: [],
    startDate: '2024-01-01',
    endDate: '2024-01-07',
  };

  const createResponse = () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ingestAdmobCsv', () => {
    it('ingests CSV content for the publisher', async () => {
      ingestFromCSVMock.mockResolvedValue(baseResult);
      const req = {
        user: { publisherId },
        file: { buffer: Buffer.from('csv-content') },
      } as unknown as Request;
      const res = createResponse();
      const next = jest.fn();

      await ingestAdmobCsv(req, res, next);

      expect(ingestFromCSVMock).toHaveBeenCalledWith(publisherId, 'csv-content');
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: baseResult });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('ingestAdmobApi', () => {
    it('uses stored credentials to fetch from API', async () => {
      ingestFromAPIMock.mockResolvedValue(baseResult);
      getCredentialsMock.mockResolvedValue({
        credentials: { accountId: 'acct-1', apiKey: 'token-1' },
      });

      const req = {
        user: { publisherId },
        body: { startDate: '2024-01-01', endDate: '2024-01-02' },
      } as unknown as Request;
      const res = createResponse();
      const next = jest.fn();

      await ingestAdmobApi(req, res, next);

      expect(getCredentialsMock).toHaveBeenCalledWith(publisherId, 'admob');
      expect(ingestFromAPIMock).toHaveBeenCalledWith(
        publisherId,
        { accountId: 'acct-1', accessToken: 'token-1' },
        '2024-01-01',
        '2024-01-02'
      );
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: baseResult });
      expect(next).not.toHaveBeenCalled();
    });

    it('propagates error when credentials missing', async () => {
      getCredentialsMock.mockResolvedValue(null);
      const req = {
        user: { publisherId },
        body: { startDate: '2024-01-01', endDate: '2024-01-02' },
      } as unknown as Request;
      const res = createResponse();
      const next = jest.fn();

      await ingestAdmobApi(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const err = next.mock.calls[0][0] as AppError;
      expect(err.statusCode).toBe(400);
    });
  });

  describe('ingestUnityApi', () => {
    it('invokes Unity ingestion when credentials exist', async () => {
      unityIngestFromAPIMock.mockResolvedValue(baseResult);
      getCredentialsMock.mockResolvedValue({
        credentials: { organizationId: 'org-1', projectId: 'proj-1', apiKey: 'unity-key' },
      });

      const req = {
        user: { publisherId },
        body: { startDate: '2024-01-01', endDate: '2024-01-07' },
      } as unknown as Request;
      const res = createResponse();
      const next = jest.fn();

      await ingestUnityApi(req, res, next);

      expect(unityIngestFromAPIMock).toHaveBeenCalledWith(
        publisherId,
        { organizationId: 'org-1', projectId: 'proj-1', apiKey: 'unity-key' },
        '2024-01-01',
        '2024-01-07'
      );
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: baseResult });
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects requests when start date is after end date', async () => {
      const req = {
        user: { publisherId },
        body: { startDate: '2024-02-01', endDate: '2024-01-01' },
      } as unknown as Request;
      const res = createResponse();
      const next = jest.fn();

      await ingestUnityApi(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const err = next.mock.calls[0][0] as AppError;
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('startDate');
    });
  });
});
