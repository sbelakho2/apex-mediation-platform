import winston from 'winston';
import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import config from '../config/index';

const logLevel = process.env.LOG_LEVEL || 'info';

/**
 * Async context storage for request-scoped logging metadata
 * Allows propagating requestId, userId, tenantId across async operations
 */
export const asyncLocalStorage = new AsyncLocalStorage<{
  requestId?: string;
  userId?: string;
  tenantId?: string;
  // Allow arbitrary metadata but avoid any
  [key: string]: unknown;
}>();

/**
 * Custom format that injects async context into logs
 */
const contextFormat = winston.format((info) => {
  const context = asyncLocalStorage.getStore();
  if (context) {
    return { ...info, ...context };
  }
  return info;
});

const normalizeStructuredKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const getLogRedactionSalt = (): string => process.env.OBS_LOG_SALT || config.logRedactionSalt || '';

const coerceToString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const hashWithSalt = (value: string): string => {
  const hash = crypto.createHash('sha256');
  hash.update(`${getLogRedactionSalt()}::${value}`);
  return hash.digest('hex');
};

const redactString = (val: string): string => {
  let s = val;
  // Email redaction (plain)
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]');
  // Email redaction (URL encoded form)
  s = s.replace(/[A-Z0-9._%+-]+%40[A-Z0-9.-]+(?:(?:%2E|\.)[A-Z]{2,})/gi, '[REDACTED_EMAIL]');
  // Authorization headers / Bearer tokens (inline)
  s = s.replace(/(authorization"?\s*:\s*")Bearer\s+[^"\s]+/gi, '$1Bearer [REDACTED]');
  s = s.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');
  // JWT-like strings (3 base64url segments, allow short segments)
  s = s.replace(/eyJ[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}/g, '[REDACTED_JWT]');
  s = s.replace(/eyJ[A-Za-z0-9_%~-]{2,}(?:%2E|\.)[A-Za-z0-9_%~-]{2,}(?:%2E|\.)[A-Za-z0-9_%~-]{2,}/gi, '[REDACTED_JWT]');
  // OAuth-style tokens in query/body (literal or URL encoded)
  s = s.replace(/(token|access_token|id_token)=([A-Za-z0-9._-]+)/gi, (_m, k) => `${k}=[REDACTED]`);
  s = s.replace(/(token|access_token|id_token)=(?:[A-Za-z0-9._-]|%2E|%2e)+/gi, (_m, k) => `${k}=[REDACTED]`);
  // Stripe keys
  s = s.replace(/sk_live_[A-Za-z0-9]+/g, 'sk_live_[REDACTED]');
  s = s.replace(/sk_test_[A-Za-z0-9]+/g, 'sk_test_[REDACTED]');
  // Long hex-like secrets (32+ hex chars)
  s = s.replace(/\b[0-9a-f]{32,}\b/gi, '[REDACTED_HEX]');
  // Potential card-like sequences (very conservative): 13-19 digits
  s = s.replace(/\b\d{13,19}\b/g, '[REDACTED_NUMERIC]');
  return s;
};

const dropStructuredValue = (): string => '[DROPPED]';

const hashIdentifier = (value: unknown): string => {
  const str = coerceToString(value);
  if (!str) return '[REDACTED]';
  return hashWithSalt(str);
};

const hashEmailValue = (value: unknown): string => {
  const str = coerceToString(value);
  if (!str) return '[REDACTED_EMAIL]';
  const normalized = str.trim().toLowerCase();
  const tail = normalized.length >= 2 ? normalized.slice(-2) : normalized;
  return `hash:${hashWithSalt(normalized)}:tail:${tail}`;
};

const truncateIpBlock = (value: unknown): string => {
  const str = coerceToString(value);
  if (!str) return '[REDACTED_IP]';
  const ipv4 = str.trim();
  const octets = ipv4.split('.');
  if (octets.length === 4 && octets.every((chunk) => {
    const n = Number(chunk);
    return Number.isFinite(n) && n >= 0 && n <= 255;
  })) {
    return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  }
  return '[REDACTED_IP]';
};

const hashPayloadValue = (value: unknown): string => {
  const str = coerceToString(value);
  if (!str) return '[REDACTED_PAYLOAD]';
  return `hash:${hashWithSalt(str)}`;
};

const sanitizeUrlValue = (value: unknown): string => {
  const str = coerceToString(value);
  if (!str) return '[REDACTED_URL]';
  const raw = str.trim();
  try {
    const hasProtocol = /^[a-z]+:/i.test(raw);
    const parsed = new URL(raw, hasProtocol ? undefined : 'http://placeholder.local');
    parsed.search = '';
    parsed.hash = '';
    const sanitized = parsed.toString();
    const printable = hasProtocol
      ? sanitized
      : sanitized.replace('http://placeholder.local', '');
    return redactString(printable);
  } catch {
    return redactString(raw);
  }
};

const STRUCTURED_KEY_HANDLERS: Record<string, (value: unknown) => unknown> = {
  userid: hashIdentifier,
  deviceid: dropStructuredValue,
  idfa: dropStructuredValue,
  gaid: dropStructuredValue,
  ipaddress: truncateIpBlock,
  ip: truncateIpBlock,
  bidpayload: hashPayloadValue,
  consentstrings: dropStructuredValue,
  consentstring: dropStructuredValue,
  url: sanitizeUrlValue,
  email: hashEmailValue,
};

const SENSITIVE_KEYS = new Set([
  'authorization',
  'auth',
  'token',
  'accessToken',
  'access_token',
  'id_token',
  'refreshToken',
  'apiKey',
  'stripeSecretKey',
  'card',
  'cardNumber',
  'email',
  'password',
  'secret',
  'cookie',
  // Proofs/crypto-related common fields — mask entirely in structured logs
  'signature',
  'sig',
  'digest',
  'hash',
  'prev_hash',
  // VRA-specific free-form reason code surfaces — always mask to avoid PII in logs
  'reason_code',
]);

function redactValue(value: unknown): unknown {
  if (value == null) return value as unknown;
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redactValue(v));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactEntry(k, v);
    }
    return out;
  }
  return value;
}

function redactEntry(key: string, value: unknown): unknown {
  const handler = STRUCTURED_KEY_HANDLERS[normalizeStructuredKey(key)];
  if (handler) {
    return handler(value);
  }
  if (SENSITIVE_KEYS.has(key)) {
    return '[REDACTED]';
  }
  return redactValue(value);
}

export const redactLogInfo = <T extends Record<string, unknown>>(info: T): T => {
  const mutated = { ...info } as Record<string, unknown>;

  if (typeof mutated.message === 'string') {
    mutated.message = redactString(mutated.message as string);
  } else if (mutated.message !== undefined) {
    mutated.message = redactValue(mutated.message);
  }

  for (const [key, value] of Object.entries(mutated)) {
    if (key === 'message') continue;
    mutated[key] = redactEntry(key, value);
  }

  return mutated as T;
};

// Build transports dynamically based on env/config
const transports: winston.transport[] = [];

// Always include console transport (stdout-first design)
transports.push(
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(
            ({ level, message, timestamp, requestId, userId, tenantId, ...metadata }) => {
              const printableTimestamp = timestamp ? String(timestamp) : '';
              const printableLevel = typeof level === 'string' ? level : String(level);
              const printableMessage = typeof message === 'string' ? message : JSON.stringify(message);

              let msg = `${printableTimestamp} [${printableLevel}]`;
              if (requestId) msg += ` [req:${requestId}]`;
              if (userId) msg += ` [user:${userId}]`;
              if (tenantId) msg += ` [tenant:${tenantId}]`;
              msg += `: ${printableMessage}`;

              const filteredMeta = { ...metadata } as Record<string, unknown>;
              delete (filteredMeta as any).service;
              delete (filteredMeta as any).timestamp;

              if (Object.keys(filteredMeta).length > 0) {
                msg += ` ${JSON.stringify(filteredMeta)}`;
              }
              return msg;
            }
          )
        ),
  })
);

// Optional file logging when LOG_TO_FILES=1 (or config.logToFiles)
if (config.logToFiles) {
  try {
    transports.push(
      new winston.transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 10 * 1024 * 1024, maxFiles: 5 })
    );
    transports.push(
      new winston.transports.File({ filename: 'logs/combined.log', maxsize: 20 * 1024 * 1024, maxFiles: 5 })
    );
  } catch {
    // If filesystem path missing or unwritable, silently fall back to console-only
  }
}

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    contextFormat(),
    winston.format((info) => redactLogInfo(info))(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'apexmediation-api' },
  transports,
});

// Export as default for easier imports
export default logger;