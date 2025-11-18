/**
 * Transparency Canonicalizer
 *
 * A single source of truth for canonical JSON serialization used for
 * Ed25519 signing and verification across the writer, controller, and CLI.
 *
 * Guarantees:
 * - Deterministic key ordering for objects (lexicographic)
 * - Stable representation for arrays
 * - Handles special JS types: BigInt, Date, Buffer, undefined
 * - Guards against circular references and excessive depth
 * - Converts NaN/Infinity to null
 */

const MAX_DEPTH = Math.max(4, +(process.env.CANONICALIZER_MAX_DEPTH || '10'));

export function canonicalString(value: unknown, seen = new WeakSet<object>(), depth = 0): string {
  if (depth > MAX_DEPTH) return 'null';

  // Handle primitives and special cases first
  const t = typeof value;
  if (value === null || value === undefined) return 'null';
  if (t === 'string') return JSON.stringify(value as string);
  if (t === 'number') return Number.isFinite(value as number) ? String(value) : 'null';
  if (t === 'boolean') return (value as boolean) ? 'true' : 'false';
  if (t === 'bigint') return JSON.stringify((value as bigint).toString());

  // Dates
  if (value instanceof Date) {
    return JSON.stringify(isNaN(value.getTime()) ? '' : value.toISOString());
  }

  // Buffers / Uint8Arrays
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return JSON.stringify((value as Buffer).toString('base64'));
  }
  if (ArrayBuffer.isView(value)) {
    const buf = Buffer.from((value as ArrayBufferView).buffer);
    return JSON.stringify(buf.toString('base64'));
  }

  // Arrays
  if (Array.isArray(value)) {
    return `[${(value as unknown[]).map((entry) => canonicalString(entry, seen, depth + 1)).join(',')}]`;
  }

  // Objects with circular guard
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return 'null';
    seen.add(obj);
    try {
      const entries = Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
      const inner = entries
        .map(([key, val]) => `${JSON.stringify(key)}:${canonicalString(val, seen, depth + 1)}`)
        .join(',');
      return `{${inner}}`;
    } finally {
      // Allow GC – not strictly necessary due to function scope, but safe
      // WeakSet does not require manual deletion
    }
  }

  // Fallback
  return 'null';
}

export function canonicalizeForSignature(payload: unknown): string {
  return canonicalString(payload);
}
