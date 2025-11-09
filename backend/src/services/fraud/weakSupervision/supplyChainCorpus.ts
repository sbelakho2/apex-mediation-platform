import { promises as fs } from 'node:fs';
import path from 'node:path';
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

  constructor(
    private readonly appAdsPath: string,
    private readonly sellersPath: string
  ) {}

  async load(): Promise<void> {
    const [appAdsContent, sellersContent] = await Promise.all([
      fs.readFile(this.appAdsPath, 'utf8'),
      fs.readFile(this.sellersPath, 'utf8'),
    ]);

    this.appAds = JSON.parse(appAdsContent) as SupplyChainCorpusData;
    this.sellers = JSON.parse(sellersContent) as SellersDirectory;
  }

  lookupSeller(sellerId: string): SellersDirectoryEntry | undefined {
    return this.sellers[sellerId];
  }

  evaluateAuthorization(context: SupplyChainContext): AuthorizationResult {
    const domainEntries = this.appAds[context.domain.toLowerCase()];

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
}
