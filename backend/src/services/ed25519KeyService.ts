import { Pool } from 'pg';
import * as crypto from 'crypto';
import logger from '../utils/logger';

export interface Ed25519KeyPair {
  keyId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  algorithm: 'Ed25519';
  createdAt: Date;
  expiresAt: Date | null;
  purpose: string;
  isActive: boolean;
}

export interface KeyMetadata {
  keyId: string;
  publicKeyPem: string;
  algorithm: 'Ed25519';
  createdAt: Date;
  expiresAt: Date | null;
  purpose: string;
  isActive: boolean;
}

/**
 * Ed25519 Key Management Service
 * 
 * Manages Ed25519 key pairs for cryptographic operations:
 * - Receipt signing (transparency)
 * - API authentication
 * - Data integrity verification
 * 
 * Features:
 * - Secure key generation
 * - Key rotation with overlapping validity
 * - Automatic key expiration
 * - Public key export for verification
 */
export class Ed25519KeyService {
  constructor(private pool: Pool) {}

  /**
   * Generate a new Ed25519 key pair
   */
  async generateKeyPair(params: {
    keyId: string;
    purpose: string;
    expiresAt?: Date;
  }): Promise<Ed25519KeyPair> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check if key ID already exists
      const existingCheck = await client.query(
        'SELECT key_id FROM ed25519_keys WHERE key_id = $1 AND deleted_at IS NULL',
        [params.keyId]
      );

      if (existingCheck.rows.length > 0) {
        throw new Error(`Key ID already exists: ${params.keyId}`);
      }

      // Generate Ed25519 key pair
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

      // Export to PEM format
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

      // Store in database
      const result = await client.query(
        `INSERT INTO ed25519_keys (
          id, key_id, public_key_pem, private_key_pem, algorithm,
          purpose, expires_at, is_active, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, 'Ed25519', $4, $5, true, NOW()
        ) RETURNING id, created_at`,
        [params.keyId, publicKeyPem, privateKeyPem, params.purpose, params.expiresAt || null]
      );

      await client.query('COMMIT');

      logger.info('Generated Ed25519 key pair', {
        keyId: params.keyId,
        purpose: params.purpose,
        expiresAt: params.expiresAt,
      });

      return {
        keyId: params.keyId,
        publicKeyPem,
        privateKeyPem,
        algorithm: 'Ed25519',
        createdAt: result.rows[0].created_at,
        expiresAt: params.expiresAt || null,
        purpose: params.purpose,
        isActive: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to generate Ed25519 key pair', { error, params });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get key pair by ID
   */
  async getKeyPair(keyId: string): Promise<Ed25519KeyPair | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          key_id, public_key_pem, private_key_pem, algorithm,
          purpose, created_at, expires_at, is_active
         FROM ed25519_keys
         WHERE key_id = $1 AND deleted_at IS NULL`,
        [keyId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        keyId: row.key_id,
        publicKeyPem: row.public_key_pem,
        privateKeyPem: row.private_key_pem,
        algorithm: row.algorithm,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        purpose: row.purpose,
        isActive: row.is_active,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get public key metadata (without private key)
   */
  async getPublicKey(keyId: string): Promise<KeyMetadata | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          key_id, public_key_pem, algorithm, purpose,
          created_at, expires_at, is_active
         FROM ed25519_keys
         WHERE key_id = $1 AND deleted_at IS NULL`,
        [keyId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        keyId: row.key_id,
        publicKeyPem: row.public_key_pem,
        algorithm: row.algorithm,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        purpose: row.purpose,
        isActive: row.is_active,
      };
    } finally {
      client.release();
    }
  }

  /**
   * List all active keys
   */
  async listActiveKeys(purpose?: string): Promise<KeyMetadata[]> {
    const client = await this.pool.connect();
    try {
      const conditions = ['deleted_at IS NULL', 'is_active = true'];
      const params: any[] = [];

      if (purpose) {
        conditions.push(`purpose = $${params.length + 1}`);
        params.push(purpose);
      }

      const whereClause = conditions.join(' AND ');

      const result = await client.query(
        `SELECT 
          key_id, public_key_pem, algorithm, purpose,
          created_at, expires_at, is_active
         FROM ed25519_keys
         WHERE ${whereClause}
         ORDER BY created_at DESC`,
        params
      );

      return result.rows.map((row) => ({
        keyId: row.key_id,
        publicKeyPem: row.public_key_pem,
        algorithm: row.algorithm,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        purpose: row.purpose,
        isActive: row.is_active,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Rotate key (deactivate old, generate new)
   */
  async rotateKey(params: {
    oldKeyId: string;
    newKeyId: string;
    purpose: string;
    expiresAt?: Date;
    gracePeriodDays?: number;
  }): Promise<Ed25519KeyPair> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify old key exists and is active
      const oldKeyResult = await client.query(
        'SELECT key_id, is_active FROM ed25519_keys WHERE key_id = $1 AND deleted_at IS NULL',
        [params.oldKeyId]
      );

      if (oldKeyResult.rows.length === 0) {
        throw new Error(`Old key not found: ${params.oldKeyId}`);
      }

      if (!oldKeyResult.rows[0].is_active) {
        throw new Error(`Old key is already inactive: ${params.oldKeyId}`);
      }

      // Generate new key pair
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

      // Insert new key
      const newKeyResult = await client.query(
        `INSERT INTO ed25519_keys (
          id, key_id, public_key_pem, private_key_pem, algorithm,
          purpose, expires_at, is_active, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, 'Ed25519', $4, $5, true, NOW()
        ) RETURNING id, created_at`,
        [params.newKeyId, publicKeyPem, privateKeyPem, params.purpose, params.expiresAt || null]
      );

      // Deactivate old key (with grace period if specified)
      const gracePeriodDays = params.gracePeriodDays || 7;
      const deactivateAt = new Date();
      deactivateAt.setDate(deactivateAt.getDate() + gracePeriodDays);

      await client.query(
        `UPDATE ed25519_keys
         SET is_active = false, deactivated_at = $1
         WHERE key_id = $2`,
        [deactivateAt, params.oldKeyId]
      );

      await client.query('COMMIT');

      logger.info('Rotated Ed25519 key', {
        oldKeyId: params.oldKeyId,
        newKeyId: params.newKeyId,
        purpose: params.purpose,
        gracePeriodDays,
      });

      return {
        keyId: params.newKeyId,
        publicKeyPem,
        privateKeyPem,
        algorithm: 'Ed25519',
        createdAt: newKeyResult.rows[0].created_at,
        expiresAt: params.expiresAt || null,
        purpose: params.purpose,
        isActive: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to rotate Ed25519 key', { error, params });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Deactivate a key
   */
  async deactivateKey(keyId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `UPDATE ed25519_keys
         SET is_active = false, deactivated_at = NOW()
         WHERE key_id = $1 AND deleted_at IS NULL
         RETURNING key_id`,
        [keyId]
      );

      if (result.rowCount === 0) {
        throw new Error(`Key not found: ${keyId}`);
      }

      logger.info('Deactivated Ed25519 key', { keyId });
    } finally {
      client.release();
    }
  }

  /**
   * Soft delete a key (mark as deleted, don't remove from DB)
   */
  async deleteKey(keyId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `UPDATE ed25519_keys
         SET deleted_at = NOW(), is_active = false
         WHERE key_id = $1 AND deleted_at IS NULL
         RETURNING key_id`,
        [keyId]
      );

      if (result.rowCount === 0) {
        throw new Error(`Key not found: ${keyId}`);
      }

      logger.info('Deleted Ed25519 key', { keyId });
    } finally {
      client.release();
    }
  }

  /**
   * Sign data with a key
   */
  async sign(keyId: string, data: Buffer | string): Promise<string> {
    const keyPair = await this.getKeyPair(keyId);
    if (!keyPair) {
      throw new Error(`Key not found: ${keyId}`);
    }

    if (!keyPair.isActive) {
      throw new Error(`Key is inactive: ${keyId}`);
    }

    if (keyPair.expiresAt && new Date() > keyPair.expiresAt) {
      throw new Error(`Key has expired: ${keyId}`);
    }

    const privateKey = crypto.createPrivateKey({
      key: keyPair.privateKeyPem,
      format: 'pem',
    });

    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
    const signature = crypto.sign(null, dataBuffer, privateKey);

    return signature.toString('hex');
  }

  /**
   * Verify signature with a key
   */
  async verify(keyId: string, data: Buffer | string, signature: string): Promise<boolean> {
    const keyMetadata = await this.getPublicKey(keyId);
    if (!keyMetadata) {
      throw new Error(`Key not found: ${keyId}`);
    }

    const publicKey = crypto.createPublicKey({
      key: keyMetadata.publicKeyPem,
      format: 'pem',
    });

    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
    const signatureBuffer = Buffer.from(signature, 'hex');

    try {
      return crypto.verify(null, dataBuffer, publicKey, signatureBuffer);
    } catch (error) {
      logger.error('Signature verification failed', { error, keyId });
      return false;
    }
  }

  /**
   * Expire old keys automatically
   */
  async expireOldKeys(): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `UPDATE ed25519_keys
         SET is_active = false, deactivated_at = NOW()
         WHERE expires_at < NOW()
           AND is_active = true
           AND deleted_at IS NULL
         RETURNING key_id`,
        []
      );

      const count = result.rowCount || 0;
      if (count > 0) {
        logger.info(`Expired ${count} old Ed25519 keys`);
      }

      return count;
    } finally {
      client.release();
    }
  }

  /**
   * Export public keys for external verification (e.g., by publishers)
   */
  async exportPublicKeys(purpose?: string): Promise<Array<{
    keyId: string;
    publicKey: string;
    algorithm: string;
    purpose: string;
    createdAt: string;
    expiresAt: string | null;
  }>> {
    const keys = await this.listActiveKeys(purpose);

    return keys.map((key) => ({
      keyId: key.keyId,
      publicKey: key.publicKeyPem,
      algorithm: key.algorithm,
      purpose: key.purpose,
      createdAt: key.createdAt.toISOString(),
      expiresAt: key.expiresAt ? key.expiresAt.toISOString() : null,
    }));
  }
}
