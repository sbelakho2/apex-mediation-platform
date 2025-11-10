import { jest } from '@jest/globals';
import type { QueryResult } from 'pg';
import {
  insertRefreshToken,
  findRefreshTokenById,
  revokeRefreshToken,
  revokeRefreshTokensForUser,
} from '../refreshTokenRepository';
import { query } from '../../utils/postgres';

jest.mock('../../utils/postgres', () => {
  const query = jest.fn();
  const initializeDatabase = jest.fn(async () => {});
  const pool = { end: jest.fn() };
  return {
    __esModule: true,
    query,
    initializeDatabase,
    default: pool,
  };
});

const queryMock = jest.mocked(query);

const baseRow = {
  id: 'token-123',
  user_id: 'user-456',
  expires_at: new Date('2025-01-10T00:00:00.000Z'),
  created_at: new Date('2025-01-01T00:00:00.000Z'),
  revoked_at: null,
  revocation_reason: null,
  replaced_by_token: null,
  user_agent: 'jest-test-agent',
  ip_address: '127.0.0.1',
};

beforeEach(() => {
  queryMock.mockReset();
});

const createQueryResult = <T extends Record<string, unknown>>(
  rows: T[],
  overrides: Partial<QueryResult<T>> = {}
): QueryResult<T> => ({
  command: 'SELECT',
  rowCount: rows.length,
  oid: 0,
  rows,
  fields: [],
  ...overrides,
});

describe('refreshTokenRepository', () => {
  it('insertRefreshToken stores metadata and maps row values to domain record', async () => {
    queryMock.mockResolvedValue(createQueryResult([baseRow]));

    const expiresAt = new Date('2025-01-10T00:00:00.000Z');

    const result = await insertRefreshToken({
      id: 'token-123',
      userId: 'user-456',
      expiresAt,
      userAgent: 'jest-test-agent',
      ipAddress: '127.0.0.1',
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO refresh_tokens'),
      ['token-123', 'user-456', expiresAt, 'jest-test-agent', '127.0.0.1']
    );

    expect(result).toEqual({
      id: 'token-123',
      userId: 'user-456',
      expiresAt: new Date('2025-01-10T00:00:00.000Z'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      revokedAt: null,
      revocationReason: null,
      replacedByToken: null,
      userAgent: 'jest-test-agent',
      ipAddress: '127.0.0.1',
    });
  });

  it('findRefreshTokenById returns null when no row found', async () => {
    queryMock.mockResolvedValue(createQueryResult([]));

    const result = await findRefreshTokenById('missing');

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), ['missing']);
    expect(result).toBeNull();
  });

  it('revokeRefreshToken updates row and returns mapped record', async () => {
    const revokedRow = {
      ...baseRow,
      revoked_at: new Date('2025-02-01T00:00:00.000Z'),
      revocation_reason: 'rotated',
      replaced_by_token: 'token-789',
    };

    queryMock.mockResolvedValue(createQueryResult([revokedRow]));

    const result = await revokeRefreshToken('token-123', 'rotated', 'token-789');

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_tokens'),
      ['token-123', 'rotated', 'token-789']
    );
    expect(result).toMatchObject({
      id: 'token-123',
      revokedAt: new Date('2025-02-01T00:00:00.000Z'),
      revocationReason: 'rotated',
      replacedByToken: 'token-789',
    });
  });

  it('revokeRefreshTokensForUser returns number of affected rows', async () => {
    queryMock.mockResolvedValue(
      createQueryResult([{ id: 'token-1' }], { rowCount: 1 })
    );

    const count = await revokeRefreshTokensForUser('user-456', 'compromised');

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_tokens'),
      ['user-456', 'compromised']
    );
    expect(count).toBe(1);
  });
});
