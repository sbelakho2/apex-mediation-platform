import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import logger from '../../utils/logger';
import { IPRangeIndex } from './ipRangeIndex';
import { createHash } from 'node:crypto';
import { z } from 'zod';

interface ManifestCloudProvider {
  provider: string;
  path: string;
}

interface ManifestVpnSource {
  name: string;
  path: string;
}

interface EnrichmentManifest {
  version: string;
  updatedAt: string;
  sources: {
    ipIntelligence: {
      abuseCsv: string;
      torExitList: string;
      cloudProviders: ManifestCloudProvider[];
    };
    asnGeo: {
      csv: string;
    };
    vpnDc: ManifestVpnSource[];
    userAgents: {
      patterns: string;
    };
  };
}

const ManifestSchema = z.object({
  version: z.string().min(1),
  updatedAt: z.string().min(1),
  sources: z.object({
    ipIntelligence: z.object({
      abuseCsv: z.string().min(1),
      torExitList: z.string().min(1),
      cloudProviders: z.array(z.object({ provider: z.string().min(1), path: z.string().min(1) })),
    }),
    asnGeo: z.object({ csv: z.string().min(1) }),
    vpnDc: z.array(z.object({ name: z.string().min(1), path: z.string().min(1) })),
    userAgents: z.object({ patterns: z.string().min(1) }),
  }),
});

interface AbuseRecord {
  category: string;
  score: number;
  source: string;
}

interface AsnGeoRecord {
  asn: number;
  organization: string;
  country: string;
  region: string;
}

interface VpnDcRecord {
  list: string;
}

interface UserAgentPattern {
  regex: RegExp;
  family: string;
  platform: string;
  category: string;
  isBot?: boolean;
}

export interface UserAgentInfo {
  family: string;
  platform: string;
  category: string;
  isBot: boolean;
}

export interface IpEnrichmentResult {
  abuseMatches: AbuseRecord[];
  isTorExitNode: boolean;
  cloudProviders: string[];
  vpnMatches: string[];
  asn?: AsnGeoRecord;
}

const SNAPSHOT_FILENAME = 'snapshot.json';

const resolveDefaultBaseDir = (): string => {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, 'data', 'enrichment'),
    path.resolve(cwd, '..', 'data', 'enrichment'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0]!;
};

const DEFAULT_FILE_CAP_BYTES = Math.max(1024 * 1024, Number.parseInt(process.env.ENRICH_MAX_BYTES || '10485760', 10)); // 10MB default

const readTextFile = async (filePath: string): Promise<string> => {
  const content = await fs.readFile(filePath, 'utf8');
  return content;
};

const readTextFileCapped = async (filePath: string, capBytes: number = DEFAULT_FILE_CAP_BYTES): Promise<string | null> => {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > capBytes) {
      logger.warn('[Enrichment] File exceeds size cap; skipping load', { filePath, size: stat.size, capBytes });
      return null;
    }
  } catch (e) {
    // If stat fails, attempt to read anyway and let read error bubble with context
    logger.debug?.('[Enrichment] stat() failed; attempting read', { filePath, error: e });
  }
  return readTextFile(filePath);
};

const ensureDirectory = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true });
};

const parseCsvLines = (content: string): string[][] => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (lines.length === 0) {
    return [];
  }

  const [headerLine, ...rows] = lines;
  const headers = headerLine.split(',').map((value) => value.trim());

  return rows.map((row) => {
    const columns = row.split(',');
    return headers.map((_, index) => (columns[index] ?? '').trim());
  });
};

const numberFromString = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export class EnrichmentService {
  private manifest: EnrichmentManifest | null = null;
  private manifestDir: string | null = null;
  private readonly baseDir: string;
  private initialized: boolean = false;
  private currentVersion: string | null = null;
  private loadingPromise: Promise<void> | null = null;

  private readonly abuseIndex = new IPRangeIndex<AbuseRecord>();
  private readonly torIndex = new IPRangeIndex<{ source: string }>();
  private readonly cloudIndexes = new Map<string, IPRangeIndex<{ provider: string }>>();
  private readonly asnIndex = new IPRangeIndex<AsnGeoRecord>();
  private readonly vpnIndex = new IPRangeIndex<VpnDcRecord>();

  private userAgentPatterns: UserAgentPattern[] = [];
  private readonly userAgentCache = new Map<string, UserAgentInfo>();

  // Stats/observability
  private lastSnapshotHash: string | null = null;
  private lastManifestHash: string | null = null;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? resolveDefaultBaseDir();
  }

  async initialize(version?: string, options?: { force?: boolean }): Promise<void> {
    const force = options?.force ?? false;

    if (!force && this.initialized && version && version === this.currentVersion) {
      return;
    }

    if (this.loadingPromise) {
      if (!force && (!version || version === this.currentVersion)) {
        return this.loadingPromise;
      }
      await this.loadingPromise;
      if (!force && this.initialized && (!version || version === this.currentVersion)) {
        return;
      }
    }

    this.loadingPromise = this.performInitialization(version, force);
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async performInitialization(version: string | undefined, force: boolean): Promise<void> {
    const { manifest, manifestDir, manifestHash } = await this.loadManifest(version);

    if (!force && this.initialized && manifest.version === this.currentVersion) {
      return;
    }

    this.resetState();

    this.manifest = manifest;
    this.manifestDir = manifestDir;
    this.currentVersion = manifest.version;
    this.lastManifestHash = manifestHash;

    await Promise.all([
      this.loadIpIntelligence(),
      this.loadAsnGeoData(),
      this.loadVpnData(),
      this.loadUserAgentPatterns(),
    ]);

    await this.writeSnapshot();

    this.initialized = true;
    logger.info('EnrichmentService initialized', {
      version: manifest.version,
      manifestDir,
    });
  }

  lookupIp(ip: string): IpEnrichmentResult {
    this.assertInitialized();

    const abuseMatches = this.abuseIndex.lookup(ip);
    const isTorExitNode = this.torIndex.lookup(ip).length > 0;
    const cloudProviders: string[] = [];

    for (const [provider, index] of this.cloudIndexes.entries()) {
      if (index.lookup(ip).length > 0) {
        cloudProviders.push(provider);
      }
    }

    const vpnMatches = this.vpnIndex.lookup(ip).map((match) => match.list);
    const asnMatch = this.asnIndex.lookup(ip)[0];

    return {
      abuseMatches,
      isTorExitNode,
      cloudProviders,
      vpnMatches,
      asn: asnMatch,
    };
  }

  parseUserAgent(userAgent: string): UserAgentInfo | null {
    this.assertInitialized();

    if (this.userAgentCache.has(userAgent)) {
      return this.userAgentCache.get(userAgent) ?? null;
    }

    for (const pattern of this.userAgentPatterns) {
      if (pattern.regex.test(userAgent)) {
        const result: UserAgentInfo = {
          family: pattern.family,
          platform: pattern.platform,
          category: pattern.category,
          isBot: Boolean(pattern.isBot),
        };
        this.userAgentCache.set(userAgent, result);
        return result;
      }
    }

    return null;
  }

  getSnapshotPath(): string {
    this.assertInitialized();
    return path.join(this.baseDir, this.manifest!.version, 'cache', SNAPSHOT_FILENAME);
  }

  private async loadManifest(version?: string): Promise<{ manifest: EnrichmentManifest; manifestDir: string; manifestHash: string }> {
    const manifestDir = version ? path.join(this.baseDir, version) : await this.resolveLatestVersionDir();
    const manifestPath = path.join(manifestDir, 'manifest.json');

    const content = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(content);
    const manifest = ManifestSchema.parse(parsed) as EnrichmentManifest;
    const manifestHash = createHash('sha256').update(content).digest('hex');
    return { manifest, manifestDir, manifestHash };
  }

  private async resolveLatestVersionDir(): Promise<string> {
    const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    if (directories.length === 0) {
      throw new Error(`No enrichment versions found under ${this.baseDir}`);
    }

    directories.sort();
    return path.join(this.baseDir, directories[directories.length - 1]!);
  }

  private async loadIpIntelligence(): Promise<void> {
    if (!this.manifest || !this.manifestDir) {
      throw new Error('Manifest not loaded before IP intelligence load');
    }

    const { ipIntelligence } = this.manifest.sources;

    await this.loadAbuseList(path.join(this.manifestDir, ipIntelligence.abuseCsv));
    await this.loadTorExitList(path.join(this.manifestDir, ipIntelligence.torExitList));

    await Promise.all(
      ipIntelligence.cloudProviders.map(async (provider) => {
        await this.loadCloudProvider(provider.provider, path.join(this.manifestDir!, provider.path));
      })
    );
  }

  private async loadAbuseList(filePath: string): Promise<void> {
    const content = await readTextFileCapped(filePath);
    if (content === null) {
      logger.warn('[Enrichment] Skipping abuse list due to size cap', { filePath });
      return;
    }
    const rows = parseCsvLines(content);

    for (const row of rows) {
      const [ip, category, score, source] = row;
      if (!ip) {
        continue;
      }

      try {
        this.abuseIndex.add(ip, {
          category,
          score: numberFromString(score),
          source: source || 'abuseipdb',
        });
      } catch (e) {
        // Skip invalid entries (e.g., IPv6 until supported)
        logger.debug?.('[Enrichment] Skipped invalid abuse IP entry', { ip, error: (e as Error)?.message });
      }
    }
  }

  private async loadTorExitList(filePath: string): Promise<void> {
    const content = await readTextFileCapped(filePath);
    if (content === null) {
      logger.warn('[Enrichment] Skipping Tor exit list due to size cap', { filePath });
      return;
    }
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    for (const line of lines) {
      try {
        this.torIndex.add(line, { source: 'tor-exit' });
      } catch (e) {
        logger.debug?.('[Enrichment] Skipped invalid Tor CIDR/IP', { line, error: (e as Error)?.message });
      }
    }
  }

  private async loadCloudProvider(provider: string, filePath: string): Promise<void> {
    const index = this.cloudIndexes.get(provider) ?? new IPRangeIndex<{ provider: string }>();
    const content = await readTextFileCapped(filePath);
    if (content === null) {
      logger.warn('[Enrichment] Skipping cloud provider list due to size cap', { provider, filePath });
      return;
    }
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    for (const line of lines) {
      try {
        index.add(line, { provider });
      } catch (e) {
        logger.debug?.('[Enrichment] Skipped invalid cloud CIDR/IP', { provider, line, error: (e as Error)?.message });
      }
    }

    this.cloudIndexes.set(provider, index);
  }

  private async loadAsnGeoData(): Promise<void> {
    if (!this.manifest || !this.manifestDir) {
      throw new Error('Manifest not loaded before ASN/Geo load');
    }

    const filePath = path.join(this.manifestDir, this.manifest.sources.asnGeo.csv);
    const content = await readTextFileCapped(filePath);
    if (content === null) {
      logger.warn('[Enrichment] Skipping ASN/Geo CSV due to size cap', { filePath });
      return;
    }
    const rows = parseCsvLines(content);

    for (const row of rows) {
      const [ipRange, asn, organization, country, region] = row;
      if (!ipRange) {
        continue;
      }

      try {
        this.asnIndex.add(ipRange, {
          asn: numberFromString(asn),
          organization,
          country,
          region,
        });
      } catch (e) {
        logger.debug?.('[Enrichment] Skipped invalid ASN/Geo range', { ipRange, error: (e as Error)?.message });
      }
    }
  }

  private async loadVpnData(): Promise<void> {
    if (!this.manifest || !this.manifestDir) {
      throw new Error('Manifest not loaded before VPN/DC load');
    }

    const sources = this.manifest.sources.vpnDc;
    await Promise.all(
      sources.map(async (source) => {
        const filePath = path.join(this.manifestDir!, source.path);
        const content = await readTextFileCapped(filePath);
        if (content === null) {
          logger.warn('[Enrichment] Skipping VPN/DC list due to size cap', { name: source.name, filePath });
          return;
        }
        const lines = content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith('#'));

        for (const line of lines) {
          try {
            this.vpnIndex.add(line, { list: source.name });
          } catch (e) {
            logger.debug?.('[Enrichment] Skipped invalid VPN/DC CIDR/IP', { list: source.name, line, error: (e as Error)?.message });
          }
        }
      })
    );
  }

  private async loadUserAgentPatterns(): Promise<void> {
    if (!this.manifest || !this.manifestDir) {
      throw new Error('Manifest not loaded before user-agent load');
    }

    const filePath = path.join(this.manifestDir, this.manifest.sources.userAgents.patterns);
    const content = await readTextFileCapped(filePath);
    if (content === null) {
      logger.warn('[Enrichment] Skipping user-agent patterns due to size cap', { filePath });
      this.userAgentPatterns = [];
      return;
    }
    const payload = JSON.parse(content) as { patterns: Array<Omit<UserAgentPattern, 'regex'> & { regex: string }> };

    const compiled: UserAgentPattern[] = [];
    for (const pattern of payload.patterns) {
      try {
        const re = new RegExp(pattern.regex, 'i');
        compiled.push({ ...pattern, regex: re });
      } catch (e) {
        logger.warn('[Enrichment] Invalid user-agent regex; skipping', { regex: pattern.regex, error: (e as Error)?.message });
      }
    }
    this.userAgentPatterns = compiled;
  }

  private async writeSnapshot(): Promise<void> {
    if (!this.manifest) {
      return;
    }

    const cacheDir = path.join(this.baseDir, this.manifest.version, 'cache');
    await ensureDirectory(cacheDir);

    const snapshot = {
      version: this.manifest.version,
      updatedAt: this.manifest.updatedAt,
      counts: {
        abuse: this.abuseIndex.count(),
        tor: this.torIndex.count(),
        cloudProviders: Array.from(this.cloudIndexes.entries()).map(([provider, index]) => ({
          provider,
          prefixes: index.count(),
        })),
        vpn: this.vpnIndex.count(),
        asn: this.asnIndex.count(),
        userAgentPatterns: this.userAgentPatterns.length,
      },
      generatedAt: new Date().toISOString(),
    };

    const snapshotPath = path.join(cacheDir, SNAPSHOT_FILENAME);
    const json = JSON.stringify(snapshot, null, 2);
    await fs.writeFile(snapshotPath, json);
    this.lastSnapshotHash = createHash('sha256').update(json).digest('hex');
  }

  private resetState(): void {
    this.initialized = false;
    this.manifest = null;
    this.manifestDir = null;
    this.currentVersion = null;

    this.abuseIndex.clear();
    this.torIndex.clear();
    this.asnIndex.clear();
    this.vpnIndex.clear();
    this.cloudIndexes.clear();
    this.userAgentPatterns = [];
    this.userAgentCache.clear();
    this.lastSnapshotHash = null;
    this.lastManifestHash = null;
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('EnrichmentService has not been initialized');
    }
  }

  /** Expose lightweight stats for diagnostics and tests */
  stats(): {
    initialized: boolean;
    version: string | null;
    counts: {
      abuse: number;
      tor: number;
      vpn: number;
      asn: number;
      cloudProviders: Array<{ provider: string; prefixes: number }>;
      userAgentPatterns: number;
    };
    snapshotHash: string | null;
    manifestHash: string | null;
  } {
    return {
      initialized: this.initialized,
      version: this.currentVersion,
      counts: {
        abuse: this.abuseIndex.count(),
        tor: this.torIndex.count(),
        vpn: this.vpnIndex.count(),
        asn: this.asnIndex.count(),
        cloudProviders: Array.from(this.cloudIndexes.entries()).map(([provider, index]) => ({
          provider,
          prefixes: index.count(),
        })),
        userAgentPatterns: this.userAgentPatterns.length,
      },
      snapshotHash: this.lastSnapshotHash,
      manifestHash: this.lastManifestHash,
    };
  }

  /** Reset the service to an uninitialized state (for tests) */
  reset(): void {
    this.resetState();
  }
}

export const enrichmentService = new EnrichmentService();
export default enrichmentService;
