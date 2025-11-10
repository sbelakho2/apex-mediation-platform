/**
 * Transparency Canonicalizer
 *
 * A single source of truth for canonical JSON serialization used for
 * Ed25519 signing and verification across the writer, controller, and CLI.
 */

export function canonicalString(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalString(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const inner = entries.map(([key, val]) => `${JSON.stringify(key)}:${canonicalString(val)}`).join(',');
    return `{${inner}}`;
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toString() : 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return 'null';
}

export function canonicalizeForSignature(payload: unknown): string {
  return canonicalString(payload);
}
