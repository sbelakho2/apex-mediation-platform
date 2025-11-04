import { query } from '../utils/postgres';

interface RefreshTokenRow {
  id: string;
  user_id: string;
  expires_at: Date;
  created_at: Date;
  revoked_at: Date | null;
  revocation_reason: string | null;
  replaced_by_token: string | null;
  user_agent: string | null;
  ip_address: string | null;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
  revocationReason: string | null;
  replacedByToken: string | null;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface CreateRefreshTokenInput {
  id: string;
  userId: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

const mapRowToRecord = (row: RefreshTokenRow): RefreshTokenRecord => ({
  id: row.id,
  userId: row.user_id,
  expiresAt: new Date(row.expires_at),
  createdAt: new Date(row.created_at),
  revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  revocationReason: row.revocation_reason,
  replacedByToken: row.replaced_by_token,
  userAgent: row.user_agent,
  ipAddress: row.ip_address,
});

export const insertRefreshToken = async (
  input: CreateRefreshTokenInput
): Promise<RefreshTokenRecord> => {
  const result = await query<RefreshTokenRow>(
    `INSERT INTO refresh_tokens (id, user_id, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, expires_at, created_at, revoked_at, revocation_reason, replaced_by_token, user_agent, ip_address`,
    [input.id, input.userId, input.expiresAt, input.userAgent ?? null, input.ipAddress ?? null]
  );

  return mapRowToRecord(result.rows[0]);
};

export const findRefreshTokenById = async (
  id: string
): Promise<RefreshTokenRecord | null> => {
  const result = await query<RefreshTokenRow>(
    `SELECT id, user_id, expires_at, created_at, revoked_at, revocation_reason, replaced_by_token, user_agent, ip_address
     FROM refresh_tokens
     WHERE id = $1`,
    [id]
  );

  const row = result.rows[0];
  return row ? mapRowToRecord(row) : null;
};

export const revokeRefreshToken = async (
  id: string,
  reason: string,
  replacedByToken?: string
): Promise<RefreshTokenRecord | null> => {
  const result = await query<RefreshTokenRow>(
    `UPDATE refresh_tokens
     SET revoked_at = NOW(),
         revocation_reason = $2,
         replaced_by_token = $3
     WHERE id = $1
     RETURNING id, user_id, expires_at, created_at, revoked_at, revocation_reason, replaced_by_token, user_agent, ip_address`,
    [id, reason, replacedByToken ?? null]
  );

  const row = result.rows[0];
  return row ? mapRowToRecord(row) : null;
};

export const revokeRefreshTokensForUser = async (
  userId: string,
  reason: string
): Promise<number> => {
  const result = await query<RefreshTokenRow>(
    `UPDATE refresh_tokens
     SET revoked_at = NOW(),
         revocation_reason = $2
     WHERE user_id = $1 AND revoked_at IS NULL
     RETURNING id`,
    [userId, reason]
  );

  return result.rowCount ?? 0;
};
