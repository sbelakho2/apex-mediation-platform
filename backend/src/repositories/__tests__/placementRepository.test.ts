import { QueryResult, QueryResultRow } from 'pg';
import * as placementRepository from '../placementRepository';
import * as postgres from '../../utils/postgres';

jest.mock('../../utils/postgres');

const mockQuery = jest.mocked(postgres.query);

const createQueryResult = <T extends QueryResultRow>(rows: T[]): QueryResult<T> => ({
  rows,
  command: 'SELECT',
  rowCount: rows.length,
  oid: 0,
  fields: [],
});

describe('placementRepository', () => {
  const publisherId = 'pub-123';
  const placementId = 'place-123';
  const appId = 'app-123';
  const basePlacement = {
    id: placementId,
    app_id: appId,
    name: 'Test Placement',
    type: 'banner',
    status: 'active',
    created_at: new Date('2025-01-01T00:00:00Z').toISOString(),
    config: { existing: true },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('scopes results to the provided publisher', async () => {
      mockQuery.mockResolvedValue(createQueryResult([basePlacement]));

      const result = await placementRepository.list(publisherId, 25, 10);

      expect(result).toEqual([basePlacement]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.publisher_id = $3'),
        [25, 10, publisherId]
      );
    });
  });

  describe('getById', () => {
    it('returns placement when owned by publisher', async () => {
      mockQuery.mockResolvedValue(createQueryResult([basePlacement]));

      const row = await placementRepository.getById(publisherId, placementId);

      expect(row).toEqual(basePlacement);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE p.id = $1 AND a.publisher_id = $2'),
        [placementId, publisherId]
      );
    });
  });

  describe('create', () => {
    it('inserts placement only when app belongs to publisher', async () => {
      mockQuery.mockResolvedValue(createQueryResult([basePlacement]));

      const created = await placementRepository.create(publisherId, {
        appId,
        name: basePlacement.name,
        type: basePlacement.type,
        status: basePlacement.status,
        config: basePlacement.config,
      });

      expect(created).toEqual(basePlacement);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE EXISTS'),
        [appId, basePlacement.name, basePlacement.type, basePlacement.status, basePlacement.config, publisherId]
      );
    });

    it('returns null when app is not owned by publisher', async () => {
      mockQuery.mockResolvedValue(createQueryResult([]));

      const created = await placementRepository.create(publisherId, {
        appId,
        name: basePlacement.name,
        type: basePlacement.type,
      });

      expect(created).toBeNull();
    });
  });

  describe('update', () => {
    it('updates placement fields when owned by publisher', async () => {
      const updatedPlacement = { ...basePlacement, name: 'Updated Name' };
      mockQuery.mockResolvedValue(createQueryResult([updatedPlacement]));

      const result = await placementRepository.update(publisherId, placementId, {
        name: 'Updated Name',
      });

      expect(result).toEqual(updatedPlacement);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('a.publisher_id = $'),
        expect.arrayContaining([placementId, publisherId])
      );
    });
  });

  describe('patchConfig', () => {
    it('deep merges config and enforces ownership', async () => {
      mockQuery
        .mockResolvedValueOnce(createQueryResult([basePlacement]))
        .mockResolvedValueOnce(
          createQueryResult([{ ...basePlacement, config: { existing: true, foo: 'bar' } }])
        );

      const result = await placementRepository.patchConfig(publisherId, placementId, { foo: 'bar' });

      expect(result?.config).toEqual({ existing: true, foo: 'bar' });
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall?.[0]).toContain('SET config = $3');
      expect(updateCall?.[1]).toEqual([
        placementId,
        publisherId,
        JSON.stringify({ existing: true, foo: 'bar' }),
      ]);
    });
  });

  describe('deleteById', () => {
    it('removes placement scoped by publisher', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 } as QueryResult);

      const removed = await placementRepository.deleteById(publisherId, placementId);

      expect(removed).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('a.publisher_id = $2'),
        [placementId, publisherId]
      );
    });
  });
});
