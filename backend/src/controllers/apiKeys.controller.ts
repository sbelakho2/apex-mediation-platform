import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import logger from '../utils/logger';

type ApiKeyRecord = {
  id: string;
  secret: string; // full secret (never log)
  prefix: string; // sk_live or sk_test
  last4: string;
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
};

// In-memory store keyed by userId for sandbox readiness
const store: Map<string, ApiKeyRecord[]> = new Map();

function ensureList(userId: string): ApiKeyRecord[] {
  if (!store.has(userId)) store.set(userId, []);
  return store.get(userId)!;
}

const redact = (k: ApiKeyRecord) => ({
  id: k.id,
  prefix: k.prefix,
  last4: k.last4,
  createdAt: k.createdAt,
  lastUsedAt: k.lastUsedAt ?? null,
  revokedAt: k.revokedAt ?? null,
});

const genId = () => randomBytes(8).toString('hex');
const genSecret = (prefix: 'sk_live' | 'sk_test') => `${prefix}_${randomBytes(24).toString('hex')}`;

export async function listKeys(req: Request, res: Response, _next: NextFunction) {
  const userId = req.user?.userId || 'anon';
  const items = ensureList(userId).map(redact);
  return res.json({ data: { keys: items } });
}

export async function createKey(req: Request, res: Response, _next: NextFunction) {
  const userId = req.user?.userId || 'anon';
  const list = ensureList(userId);
  const live = Boolean(req.body?.live);
  const prefix = live ? 'sk_live' : 'sk_test';
  const secret = genSecret(prefix as any);
  const rec: ApiKeyRecord = {
    id: genId(),
    secret,
    prefix,
    last4: secret.slice(-4),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  list.push(rec);
  logger.info('API key created', { userId, prefix, last4: rec.last4, id: rec.id });
  return res.status(201).json({ data: { id: rec.id, secret: rec.secret, prefix: rec.prefix, last4: rec.last4 } });
}

export async function rotateKey(req: Request, res: Response, _next: NextFunction) {
  const userId = req.user?.userId || 'anon';
  const id = req.params.id;
  const list = ensureList(userId);
  const idx = list.findIndex(k => k.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const old = list[idx];
  old.revokedAt = new Date().toISOString();
  const secret = genSecret(old.prefix as any);
  const rotated: ApiKeyRecord = {
    id: genId(),
    secret,
    prefix: old.prefix,
    last4: secret.slice(-4),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  list.push(rotated);
  logger.info('API key rotated', { userId, idOld: old.id, idNew: rotated.id, prefix: rotated.prefix, last4: rotated.last4 });
  return res.json({ data: { id: rotated.id, secret: rotated.secret, prefix: rotated.prefix, last4: rotated.last4 } });
}

export async function deleteKey(req: Request, res: Response, _next: NextFunction) {
  const userId = req.user?.userId || 'anon';
  const id = req.params.id;
  const list = ensureList(userId);
  const idx = list.findIndex(k => k.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const rec = list[idx];
  rec.revokedAt = new Date().toISOString();
  list.splice(idx, 1);
  logger.info('API key deleted', { userId, id });
  return res.status(204).send();
}
