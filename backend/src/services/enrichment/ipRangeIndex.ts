export interface RangeBounds {
  start: number;
  end: number;
}

export const IPV4_MAX = 0xffffffff;

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

const parseRangeNotation = (range: string): RangeBounds => {
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

const parseCidr = (cidr: string): RangeBounds => {
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

export const parseCidrOrIp = (input: string): RangeBounds => {
  const trimmed = input.trim();
  if (trimmed.includes('/')) {
    return parseCidr(trimmed);
  }
  if (trimmed.includes('-')) {
    return parseRangeNotation(trimmed);
  }
  const value = ipv4ToNumber(trimmed);
  return { start: value, end: value };
};

interface RangeEntry<M> extends RangeBounds {
  metadata: M[];
}

export class IPRangeIndex<M> {
  private ranges: RangeEntry<M>[] = [];
  private needsSort: boolean = false;

  add(range: string, metadata: M): void {
    const bounds = parseCidrOrIp(range);
    const existing = this.ranges.find((entry) => entry.start === bounds.start && entry.end === bounds.end);
    if (existing) {
      existing.metadata.push(metadata);
      return;
    }

    this.ranges.push({ ...bounds, metadata: [metadata] });
    this.needsSort = true;
  }

  addBounds(bounds: RangeBounds, metadata: M): void {
    const existing = this.ranges.find((entry) => entry.start === bounds.start && entry.end === bounds.end);
    if (existing) {
      existing.metadata.push(metadata);
      return;
    }
    this.ranges.push({ ...bounds, metadata: [metadata] });
    this.needsSort = true;
  }

  lookup(ip: string): M[] {
    if (this.ranges.length === 0) {
      return [];
    }

    if (this.needsSort) {
      this.sortRanges();
    }

    const value = ipv4ToNumber(ip);
    let low = 0;
    let high = this.ranges.length - 1;
    let bestIndex = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const current = this.ranges[mid];
      if (current.start <= value) {
        bestIndex = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (bestIndex === -1) {
      return [];
    }

    const candidate = this.ranges[bestIndex];
    return value <= candidate.end ? candidate.metadata : [];
  }

  count(): number {
    return this.ranges.length;
  }

  clear(): void {
    this.ranges = [];
    this.needsSort = false;
  }

  private sortRanges(): void {
    this.ranges.sort((a, b) => a.start - b.start);
    this.needsSort = false;
  }
}
