export interface RangeBoundsV4 {
  start: number;
  end: number;
}

export interface RangeBoundsV6 {
  start: bigint;
  end: bigint;
}

export const IPV4_MAX = 0xffffffff;
const IPV6_MAX = (1n << 128n) - 1n;

export const ipv4ToNumber = (ip: string): number => {
  const octets = ip.trim().split('.');
  if (octets.length !== 4) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }

  const value = octets.reduce((acc, octet) => {
    const parsed = Number(octet);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
      throw new Error(`Invalid IPv4 octet "${octet}" in ${ip}`);
    }
    return (acc << 8) + parsed;
  }, 0);

  return value >>> 0;
};

const parseRangeNotationV4 = (range: string): RangeBoundsV4 => {
  const [start, end] = range.split('-').map((part) => part.trim());
  if (!start || !end) {
    throw new Error(`Invalid IP range notation: ${range}`);
  }
  const startVal = ipv4ToNumber(start);
  const endVal = ipv4ToNumber(end);
  if (endVal < startVal) {
    throw new Error(`Range end precedes start: ${range}`);
  }
  return { start: startVal, end: endVal };
};

const parseCidrV4 = (cidr: string): RangeBoundsV4 => {
  const [ip, prefixStr] = cidr.split('/');
  if (!ip || !prefixStr) {
    throw new Error(`Invalid CIDR: ${cidr}`);
  }

  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Invalid CIDR prefix in ${cidr}`);
  }

  const base = ipv4ToNumber(ip.trim());
  const hostBits = 32 - prefix;
  const blockSize = hostBits === 0 ? 1 : Math.pow(2, hostBits);
  const network = base - (base % blockSize);
  const broadcast = Math.min(network + blockSize - 1, IPV4_MAX);

  return {
    start: network >>> 0,
    end: broadcast >>> 0,
  };
};

const expandIpv6 = (ip: string): string[] => {
  // Expand IPv6 with :: shorthand
  const lower = ip.toLowerCase();
  const hasDouble = lower.includes('::');
  if (!hasDouble) {
    const parts = lower.split(':');
    if (parts.length !== 8) throw new Error(`Invalid IPv6 address: ${ip}`);
    return parts;
  }
  const [head, tail] = lower.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - (headParts.length + tailParts.length);
  if (missing <= 0) throw new Error(`Invalid IPv6 address: ${ip}`);
  return [...headParts, ...Array(missing).fill('0'), ...tailParts].map((p) => p || '0');
};

export const ipv6ToBigInt = (ip: string): bigint => {
  const parts = expandIpv6(ip.trim());
  let value = 0n;
  for (const part of parts) {
    const n = BigInt(parseInt(part, 16));
    if (n < 0n || n > 0xffffn || Number.isNaN(Number(n))) {
      throw new Error(`Invalid IPv6 hextet "${part}" in ${ip}`);
    }
    value = (value << 16n) + n;
  }
  return value;
};

const parseCidrV6 = (cidr: string): RangeBoundsV6 => {
  const [ip, prefixStr] = cidr.split('/');
  if (!ip || !prefixStr) {
    throw new Error(`Invalid CIDR: ${cidr}`);
  }
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
    throw new Error(`Invalid IPv6 CIDR prefix in ${cidr}`);
  }
  const base = ipv6ToBigInt(ip.trim());
  const hostBits = 128 - prefix;
  const mask = hostBits === 0 ? IPV6_MAX : (~((1n << BigInt(hostBits)) - 1n)) & IPV6_MAX;
  const network = base & mask;
  const broadcast = network | (~mask & IPV6_MAX);
  return { start: network, end: broadcast };
};

type ParsedBounds = { family: 4; bounds: RangeBoundsV4 } | { family: 6; bounds: RangeBoundsV6 };

export const parseCidrOrIp = (input: string): ParsedBounds => {
  const trimmed = input.trim();
  const isV6 = trimmed.includes(':');
  if (isV6) {
    if (trimmed.includes('/')) {
      return { family: 6, bounds: parseCidrV6(trimmed) };
    }
    const val = ipv6ToBigInt(trimmed);
    return { family: 6, bounds: { start: val, end: val } };
  }
  if (trimmed.includes('/')) {
    return { family: 4, bounds: parseCidrV4(trimmed) };
  }
  if (trimmed.includes('-')) {
    return { family: 4, bounds: parseRangeNotationV4(trimmed) };
  }
  const value = ipv4ToNumber(trimmed);
  return { family: 4, bounds: { start: value, end: value } };
};

interface RangeEntryV4<M> extends RangeBoundsV4 {
  metadata: M[];
}

interface RangeEntryV6<M> extends RangeBoundsV6 {
  metadata: M[];
}

export class IPRangeIndex<M> {
  private rangesV4: RangeEntryV4<M>[] = [];
  private rangesV6: RangeEntryV6<M>[] = [];
  private needsSortV4: boolean = false;
  private needsSortV6: boolean = false;
  private lastSortAt: number | null = null;

  add(range: string, metadata: M): void {
    const parsed = parseCidrOrIp(range);
    if (parsed.family === 4) {
      const bounds = parsed.bounds;
      const existing = this.rangesV4.find((e) => e.start === bounds.start && e.end === bounds.end);
      if (existing) {
        existing.metadata.push(metadata);
        return;
      }
      this.rangesV4.push({ ...bounds, metadata: [metadata] });
      this.needsSortV4 = true;
    } else {
      const bounds = parsed.bounds;
      const existing = this.rangesV6.find((e) => e.start === bounds.start && e.end === bounds.end);
      if (existing) {
        existing.metadata.push(metadata);
        return;
      }
      this.rangesV6.push({ ...bounds, metadata: [metadata] });
      this.needsSortV6 = true;
    }
  }

  addBounds(bounds: RangeBoundsV4 | RangeBoundsV6, metadata: M): void {
    if (typeof (bounds as any).start === 'number') {
      const b = bounds as RangeBoundsV4;
      const existing = this.rangesV4.find((e) => e.start === b.start && e.end === b.end);
      if (existing) { existing.metadata.push(metadata); return; }
      this.rangesV4.push({ ...b, metadata: [metadata] });
      this.needsSortV4 = true;
    } else {
      const b = bounds as RangeBoundsV6;
      const existing = this.rangesV6.find((e) => e.start === b.start && e.end === b.end);
      if (existing) { existing.metadata.push(metadata); return; }
      this.rangesV6.push({ ...b, metadata: [metadata] });
      this.needsSortV6 = true;
    }
  }

  lookup(ip: string): M[] {
    const isV6 = ip.includes(':');
    if (!isV6 && this.rangesV4.length === 0) {
      return [];
    }
    if (isV6 && this.rangesV6.length === 0) {
      return [];
    }

    if (isV6) {
      if (this.needsSortV6) this.finalize();
      const value = ipv6ToBigInt(ip);
      let low = 0;
      let high = this.rangesV6.length - 1;
      let best = -1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const current = this.rangesV6[mid];
        if (current.start <= value) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (best === -1) return [];
      const cand = this.rangesV6[best];
      return value <= cand.end ? cand.metadata : [];
    } else {
      if (this.needsSortV4) this.finalize();
      const value = ipv4ToNumber(ip);
      let low = 0;
      let high = this.rangesV4.length - 1;
      let best = -1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const current = this.rangesV4[mid];
        if (current.start <= value) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (best === -1) return [];
      const cand = this.rangesV4[best];
      return value <= cand.end ? cand.metadata : [];
    }
  }

  count(): number {
    return this.rangesV4.length + this.rangesV6.length;
  }

  clear(): void {
    this.rangesV4 = [];
    this.rangesV6 = [];
    this.needsSortV4 = false;
    this.needsSortV6 = false;
    this.lastSortAt = null;
  }

  /**
   * Sort ranges and coalesce overlapping/adjacent spans to minimize search set.
   * Called automatically before first lookup.
   */
  finalize(): void {
    const mergeV4 = () => {
      if (!this.needsSortV4) return;
      this.rangesV4.sort((a, b) => a.start - b.start || a.end - b.end);
      const merged: RangeEntryV4<M>[] = [];
      for (const current of this.rangesV4) {
        if (merged.length === 0) { merged.push({ ...current, metadata: [...current.metadata] }); continue; }
        const last = merged[merged.length - 1];
        if (current.start <= (last.end + 1)) {
          if (current.end > last.end) { last.end = current.end; }
          const seen = new Set(last.metadata.map((m) => JSON.stringify(m)));
          for (const m of current.metadata) { const key = JSON.stringify(m); if (!seen.has(key)) { last.metadata.push(m); seen.add(key); } }
        } else {
          merged.push({ ...current, metadata: [...current.metadata] });
        }
      }
      this.rangesV4 = merged;
      this.needsSortV4 = false;
    };

    const mergeV6 = () => {
      if (!this.needsSortV6) return;
      this.rangesV6.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
      const merged: RangeEntryV6<M>[] = [];
      for (const current of this.rangesV6) {
        if (merged.length === 0) { merged.push({ ...current, metadata: [...current.metadata] }); continue; }
        const last = merged[merged.length - 1];
        // Overlap or adjacency for BigInt (end + 1 >= start)
        if (current.start <= (last.end + 1n)) {
          if (current.end > last.end) { last.end = current.end; }
          const seen = new Set(last.metadata.map((m) => JSON.stringify(m)));
          for (const m of current.metadata) { const key = JSON.stringify(m); if (!seen.has(key)) { last.metadata.push(m); seen.add(key); } }
        } else {
          merged.push({ ...current, metadata: [...current.metadata] });
        }
      }
      this.rangesV6 = merged;
      this.needsSortV6 = false;
    };

    mergeV4();
    mergeV6();
    this.lastSortAt = Date.now();
  }

  /** Bulk load convenience helper */
  loadFromCidrs(inputs: Array<{ range: string; meta: M }>): void {
    for (const { range, meta } of inputs) {
      try {
        this.add(range, meta);
      } catch (_e) {
        // skip invalid inputs silently; caller may log if desired
      }
    }
  }

  /** Simple stats for diagnostics/testing */
  stats(): { count: number; finalized: boolean; lastSortAt: number | null; v4: number; v6: number } {
    return { count: this.count(), finalized: !(this.needsSortV4 || this.needsSortV6), lastSortAt: this.lastSortAt, v4: this.rangesV4.length, v6: this.rangesV6.length };
  }
}
