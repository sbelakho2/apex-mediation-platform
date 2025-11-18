import crypto from 'crypto';

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export interface AesGcmCiphertext {
  iv: string; // base64
  authTag: string; // base64
  ciphertext: string; // base64
}

function getKey(): Buffer {
  const key = process.env.APP_KMS_KEY || '';
  if (!key) throw new Error('APP_KMS_KEY is required for encryption');
  // Accept base64 or hex (fallback to utf8)
  try {
    if (/^[A-Fa-f0-9]{64}$/.test(key)) return Buffer.from(key, 'hex');
    const b = Buffer.from(key, 'base64');
    if (b.length === 32) return b;
  } catch {}
  const buf = Buffer.from(key, 'utf8');
  // Derive 32 bytes via sha256 if shorter
  return crypto.createHash('sha256').update(buf).digest();
}

export function aesGcmEncrypt(plaintext: string): AesGcmCiphertext {
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    authTag: tag.toString('base64'),
    ciphertext: enc.toString('base64'),
  };
}

export function aesGcmDecrypt(ct: AesGcmCiphertext): string {
  const key = getKey();
  const iv = Buffer.from(ct.iv, 'base64');
  const tag = Buffer.from(ct.authTag, 'base64');
  const data = Buffer.from(ct.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

export function md5_16(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex').slice(0, 16);
}
