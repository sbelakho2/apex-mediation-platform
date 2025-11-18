import { promises as fs } from 'node:fs';
import path from 'node:path';
import logger from '../../../utils/logger';
import type { SupplyChainContext } from './types';

interface AppAdsEntry {
  sellerId: string;
  relationship?: string;
  appStoreId?: string;
  siteId?: string;
}

interface SupplyChainCorpusData {
  [domain: string]: AppAdsEntry[];
}

interface SellersDirectoryEntry {
  sellerId: string;
  domain?: string;
  name?: string;
  status?: 'active' | 'inactive';
}

interface SellersDirectory {
  [sellerId: string]: SellersDirectoryEntry;
}

export interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
  sellerInfo?: SellersDirectoryEntry;
}

export class SupplyChainCorpus {
  private appAds: SupplyChainCorpusData = {};
  private sellers: SellersDirectory = {};
  private readonly maxBytes: number;

  constructor(
    private readonly appAdsPath: string,
    private readonly sellersPath: string,
    options?: { maxBytes?: number }
  ) {
    // Default JSON size guard: 5 MB unless overridden via env or options
    const envCap = parseInt(process.env.WS_SUPPLYCHAIN_MAX_BYTES || '', 10);
    const cap = Number.isFinite(envCap) && envCap > 0 ? envCap : 5 * 1024 * 1024;
    this.maxBytes = options?.maxBytes && options.maxBytes > 0 ? options.maxBytes : cap;
  }

  async load(): Promise<void> {
    try {
      const [appAdsBuf, sellersBuf] = await Promise.all([
        fs.readFile(this.appAdsPath),
        fs.readFile(this.sellersPath),
      ]);

      if (appAdsBuf.byteLength > this.maxBytes) {
        logger.warn('[WeakSupervision] app-ads corpus exceeds size cap; truncating load', {
          path: this.appAdsPath,
          bytes: appAdsBuf.byteLength,
          maxBytes: this.maxBytes,
        });
        this.appAds = {};
      } else {
        const parsed = JSON.parse(appAdsBuf.toString('utf8')) as SupplyChainCorpusData;
        this.appAds = this.normalizeAppAds(parsed);
      }

      if (sellersBuf.byteLength > this.maxBytes) {
        logger.warn('[WeakSupervision] sellers directory exceeds size cap; truncating load', {
          path: this.sellersPath,
          bytes: sellersBuf.byteLength,
          maxBytes: this.maxBytes,
        });
        this.sellers = {};
      } else {
        const parsed = JSON.parse(sellersBuf.toString('utf8')) as SellersDirectory;
        this.sellers = parsed;
      }
    } catch (error) {
      logger.error('[WeakSupervision] Failed to load supply chain corpus; using empty datasets', {
        appAdsPath: this.appAdsPath,
        sellersPath: this.sellersPath,
        error,
      });
      this.appAds = {};
      this.sellers = {};
    }
  }

  lookupSeller(sellerId: string): SellersDirectoryEntry | undefined {
    return this.sellers[sellerId];
  }

  evaluateAuthorization(context: SupplyChainContext): AuthorizationResult {
    const domainEntries = this.appAds[context.domain.toLowerCase().trim()];

    if (!domainEntries || domainEntries.length === 0) {
      return {
        authorized: false,
        reason: `Domain ${context.domain} missing from app-ads.txt corpus`,
      };
    }

    const match = domainEntries.find((entry) => entry.sellerId === context.sellerId);

    if (!match) {
      return {
        authorized: false,
        reason: `Seller ${context.sellerId} not declared for ${context.domain}`,
        sellerInfo: this.lookupSeller(context.sellerId),
      };
    }

    if (context.appStoreId && match.appStoreId && match.appStoreId !== context.appStoreId) {
      return {
        authorized: false,
        reason: `App store ID mismatch: expected ${match.appStoreId}, received ${context.appStoreId}`,
        sellerInfo: this.lookupSeller(context.sellerId),
      };
    }

    return {
      authorized: true,
      sellerInfo: this.lookupSeller(context.sellerId),
    };
  }

  static resolvePaths(baseDir: string, relativeAppAds: string, relativeSellers: string): {
    appAdsPath: string;
    sellersPath: string;
  } {
    return {
      appAdsPath: path.resolve(baseDir, relativeAppAds),
      sellersPath: path.resolve(baseDir, relativeSellers),
    };
  }

  private normalizeAppAds(input: SupplyChainCorpusData): SupplyChainCorpusData {
    const out: SupplyChainCorpusData = {};
    for (const [domain, entries] of Object.entries(input || {})) {
      const key = domain.toLowerCase().trim();
      if (!Array.isArray(entries)) {
        logger.warn('[WeakSupervision] Invalid app-ads entry type; expected array', { domain });
        continue;
      }
      out[key] = entries
        .filter((e) => typeof e?.sellerId === 'string' && e.sellerId.trim().length > 0)
        .map((e) => ({
          sellerId: e.sellerId.trim(),
          relationship: e.relationship,
          appStoreId: e.appStoreId,
          siteId: e.siteId,
        }));
    }
    return out;
  }
}
