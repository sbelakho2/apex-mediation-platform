import crypto from 'crypto';
import logger from './logger';

const ED25519 = 'ed25519';

let privateKeyDer: Buffer | null = null;
let publicKeyDer: Buffer | null = null;
let kid: string = process.env.SIGNING_KID || 'dev-key';

try {
  if (process.env.SIGNING_PRIVATE_KEY_PEM) {
    privateKeyDer = crypto.createPrivateKey(process.env.SIGNING_PRIVATE_KEY_PEM).export({ format: 'der', type: 'pkcs8' }) as Buffer;
  }
  if (process.env.SIGNING_PUBLIC_KEY_PEM) {
    publicKeyDer = crypto.createPublicKey(process.env.SIGNING_PUBLIC_KEY_PEM).export({ format: 'der', type: 'spki' }) as Buffer;
  }
} catch (error) {
  logger.error('Failed to parse signing keys from environment', { error: (error as Error).message });
  privateKeyDer = null;
  publicKeyDer = null;
}

if (!privateKeyDer || !publicKeyDer) {
  try {
    const { privateKey, publicKey } = crypto.generateKeyPairSync(ED25519);
    privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
    publicKeyDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    kid = 'ephemeral-dev';
    logger.warn('Signing keys not provided via env; using ephemeral dev keypair');
  } catch (error) {
    logger.error('Failed to generate Ed25519 keypair', { error: (error as Error).message });
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
  if (!privateKeyDer) throw new Error('SIGNING_PRIVATE_KEY_PEM not configured');
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    ...claims,
    exp: iat + expiresInSeconds,
    iat,
  };
  const payloadBuffer = Buffer.from(JSON.stringify(payload));
  const signature = crypto.sign(null, payloadBuffer, {
    key: crypto.createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' }),
  });
  const segments = [
    'ed25519',
    kid,
    signature.toString('base64url'),
    payloadBuffer.toString('base64url'),
  ];
  return segments.join('.');
}

export function verifyToken<T = Record<string, unknown>>(token: string): T {
  if (!publicKeyDer) throw new Error('SIGNING_PUBLIC_KEY_PEM not configured');
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'ed25519') {
    throw new Error('Invalid token format');
  }
  const [, , signatureB64, payloadB64] = parts;
  const payloadBuffer = Buffer.from(payloadB64, 'base64url');
  const signature = Buffer.from(signatureB64, 'base64url');
  const verified = crypto.verify(null, payloadBuffer, {
    key: crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' }),
  }, signature);
  if (!verified) throw new Error('Invalid signature');
  const payload = JSON.parse(payloadBuffer.toString('utf8'));
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    throw new Error('Token expired');
  }
  return payload as T;
}

export function getActiveKid(): string { return kid; }
