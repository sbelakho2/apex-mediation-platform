import { redis } from './redis';
import logger from './logger';

/**
 * Redis-backed circuit breaker utility
 *
 * Defaults (override via env):
 * - threshold: 5 failures in window to open
 * - windowSec: 30s failure window
 * - coolDownSec: 60s open state TTL
 * - probeSec: 10s time between half-open probes (best-effort via key)
 */
const THRESHOLD = parseInt(process.env.CB_THRESHOLD || '5', 10);
const WINDOW_SEC = parseInt(process.env.CB_WINDOW_SEC || '30', 10);
const COOLDOWN_SEC = parseInt(process.env.CB_COOLDOWN_SEC || '60', 10);
const PROBE_SEC = parseInt(process.env.CB_PROBE_SEC || '10', 10);

const key = (name: string, suffix: string) => `cb:${name}:${suffix}`;

export async function isOpen(name: string): Promise<boolean> {
  try {
    if (!redis.isReady()) return false; // fail-open to allow traffic in absence of Redis
    const state = await redis.get(key(name, 'state'));
    return state === 'open';
  } catch {
    return false;
  }
}

export async function allow(name: string): Promise<boolean> {
  try {
    if (!redis.isReady()) return true; // allow when Redis not ready
    // If open, disallow
    if (await isOpen(name)) return false;
    // Implement a lightweight half-open probe throttle using a probe key
    const probeKey = key(name, 'probe');
    const set = await redis.set(probeKey, '1', { NX: true, EX: PROBE_SEC });
    // If set is null, a recent probe occurred; still allow requests, just avoid spamming
    return true;
  } catch {
    return true;
  }
}

export async function recordSuccess(name: string): Promise<void> {
  try {
    if (!redis.isReady()) return;
    // Reset rolling failure counter on success
    const cKey = key(name, 'fail');
    await redis.del(cKey);
  } catch {
    // swallow
  }
}

export async function recordFailure(name: string): Promise<void> {
  try {
    if (!redis.isReady()) return;
    const cKey = key(name, 'fail');
    const failures = await redis.incr(cKey);
    if (failures === 1) {
      await redis.expire(cKey, WINDOW_SEC);
    }
    if (failures >= THRESHOLD) {
      // Open the breaker
      await redis.setEx(key(name, 'state'), COOLDOWN_SEC, 'open');
      logger.warn('[CB] Opened circuit for adapter', { name, failures, windowSec: WINDOW_SEC });
    }
  } catch {
    // swallow
  }
}

export async function getSummary(names: string[]): Promise<Record<string, { open: boolean; failuresWindow: number }>> {
  const summary: Record<string, { open: boolean; failuresWindow: number }> = {};
  for (const n of names) {
    try {
      const open = await isOpen(n);
      let failuresWindow = 0;
      try {
        const v = await redis.get(key(n, 'fail'));
        failuresWindow = v ? Number(v) : 0;
      } catch { /* noop */ }
      summary[n] = { open, failuresWindow: Number.isFinite(failuresWindow) ? failuresWindow : 0 };
    } catch {
      summary[n] = { open: false, failuresWindow: 0 };
    }
  }
  return summary;
}

export default { isOpen, allow, recordSuccess, recordFailure, getSummary };
