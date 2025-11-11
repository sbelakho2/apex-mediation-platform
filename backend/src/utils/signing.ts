import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import logger from './logger';

const ALG: jwt.Algorithm = 'EdDSA';

let privateKeyPem: string | null = process.env.SIGNING_PRIVATE_KEY_PEM || null;
let publicKeyPem: string | null = process.env.SIGNING_PUBLIC_KEY_PEM || null;
let kid: string = process.env.SIGNING_KID || 'dev-key';

// Dev fallback: generate ephemeral key pair if none provided (dev only)
if (!privateKeyPem || !publicKeyPem) {
  try {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    kid = 'ephemeral-dev';
    logger.warn('Signing keys not provided via env; using ephemeral dev keypair');
  } catch (e) {
    logger.error('Failed to generate Ed25519 keypair', { error: (e as Error).message });
  }
}

export interface DeliveryTokenPayload {
  bidId: string;
  placementId: string;
  adapter: string;
  cpm: number;
  currency: 'USD';
  purpose: 'delivery' | 'imp' | 'click';
  nonce: string;
}

export function signToken<T extends object>(claims: T, expiresInSeconds: number): string {
  if (!privateKeyPem) throw new Error('SIGNING_PRIVATE_KEY_PEM not configured');
  return jwt.sign(claims as any, privateKeyPem, {
    algorithm: ALG,
    keyid: kid,
    expiresIn: expiresInSeconds,
  });
}

export function verifyToken<T = any>(token: string): T {
  if (!publicKeyPem) throw new Error('SIGNING_PUBLIC_KEY_PEM not configured');
  const decoded = jwt.verify(token, publicKeyPem, { algorithms: [ALG] });
  return decoded as T;
}

export function getActiveKid(): string { return kid; }
