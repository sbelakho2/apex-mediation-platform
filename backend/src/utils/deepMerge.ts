/*
 * Deep merge utility with non-destructive semantics.
 * - Arrays are replaced (last-in wins) to avoid accidental concatenation of lists like geos.
 * - Plain objects are merged recursively.
 * - Primitive values (string/number/boolean/null) are replaced.
 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function deepMerge<T extends Json>(target: T, source: Partial<T>): T {
  if (!isPlainObject(target) || !isPlainObject(source as any)) {
    // For non-objects or arrays/primitives: source wins when defined, else target
    return (source === undefined ? target : (source as T));
  }

  const out: Record<string, Json> = { ...(target as any) };
  for (const [key, srcVal] of Object.entries(source as Record<string, Json>)) {
    const tgtVal = out[key];
    if (srcVal === undefined) {
      continue; // ignore undefined so PATCH can omit
    }
    if (Array.isArray(srcVal)) {
      // Replace arrays entirely
      out[key] = srcVal.slice();
      continue;
    }
    if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      out[key] = deepMerge(tgtVal as Json, srcVal as Json);
      continue;
    }
    // Primitives or object replacing primitive
    out[key] = srcVal;
  }
  return out as T;
}

export default deepMerge;
