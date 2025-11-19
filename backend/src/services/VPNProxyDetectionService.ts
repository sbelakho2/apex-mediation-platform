/**
 * VPN/Proxy Detection Service
 * 
 * Multi-factor country validation to prevent geographic discount abuse
 * Uses: IP geolocation + Payment method country + App store country
 */

import { promises as dns } from 'dns';
import { Reader } from '@maxmind/geoip2-node';
import { Pool } from 'pg';
import { enrichmentService as sharedEnrichmentService, EnrichmentService as EnrichmentServiceType } from './enrichment/enrichmentService';
import logger from '../utils/logger';
import { isIP } from 'node:net';

type GeoIpReader = {
  city(ip: string): Promise<{ country?: { isoCode?: string | null } }>;
  asn(ip: string): Promise<{ autonomousSystemOrganization?: string | null }>;
};

type DnsReverseLookup = (ip: string) => Promise<string[]>;

interface VPNProxyDetectionServiceOptions {
  geoipReader?: GeoIpReader;
  enrichmentService?: EnrichmentServiceType;
  dnsReverseLookup?: DnsReverseLookup;
}

interface CountryValidationResult {
  is_valid: boolean;
  detected_country: string | null;
  ip_country: string | null;
  payment_country: string | null;
  app_store_country: string | null;
  confidence_score: number; // 0-100
  risk_level: 'low' | 'medium' | 'high';
  reasons: string[];
}

interface GeographicDiscountRequest {
  customer_id: string;
  ip_address: string;
  payment_country: string; // From Stripe payment method
  app_store_country?: string; // From iOS/Android purchase
}

interface CountryValidationLogEntry {
  customer_id: string;
  ip_country: string | null;
  payment_country: string | null;
  app_store_country: string | null;
  detected_country: string | null;
  confidence_score: number;
  risk_level: 'low' | 'medium' | 'high';
  is_valid: boolean;
  reasons: string[];
  created_at: Date;
}

const parseReasons = (value: unknown): string[] => {
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value as string[];
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
    } catch (error) {
      console.warn('[VPNDetection] Failed to parse validation reasons JSON', { error });
    }
  }

  return [];
};

export class VPNProxyDetectionService {
  private geoipReader: GeoIpReader | null = null;
  private pool: Pool;
  private enrichmentService: EnrichmentServiceType;
  private readonly dnsReverse: DnsReverseLookup;
  // Short‑TTL caches to avoid repeated lookups (configurable via VPN_IPCACHE_TTL_MS)
  private readonly cacheTtlMs: number = Math.max(1000, parseInt(process.env.VPN_IPCACHE_TTL_MS || '60000', 10));
  private ipCountryCache = new Map<string, { value: string | null; expiresAt: number }>();
  private asnOrgCache = new Map<string, { value: string | null; expiresAt: number }>();
  private reverseDnsCache = new Map<string, { value: string[]; expiresAt: number }>();

  constructor(pool: Pool, options?: VPNProxyDetectionServiceOptions) {
    this.pool = pool;
    this.enrichmentService = options?.enrichmentService ?? sharedEnrichmentService;
    this.dnsReverse = options?.dnsReverseLookup ?? dns.reverse;

    if (options?.geoipReader) {
      this.geoipReader = options.geoipReader;
    } else {
      void this.initializeGeoIP();
    }
  }

  /**
   * Initialize MaxMind GeoIP2 database
   * Download from: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
   */
  private async initializeGeoIP(): Promise<void> {
    const geoipPath = process.env.GEOIP_DATABASE_PATH || '/opt/geoip/GeoLite2-Country.mmdb';
    const maxAttempts = Math.max(1, parseInt(process.env.GEOIP_INIT_RETRIES || '3', 10));
    const baseDelayMs = Math.max(100, parseInt(process.env.GEOIP_INIT_BACKOFF_MS || '250', 10));

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.geoipReader = (await Reader.open(geoipPath)) as unknown as GeoIpReader;
        logger.info('[VPNDetection] GeoIP database loaded successfully', { geoipPath });
        return;
      } catch (error) {
        logger.warn('[VPNDetection] Failed to load GeoIP database', { attempt, maxAttempts, geoipPath, error });
        if (attempt < maxAttempts) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    logger.error('[VPNDetection] GeoIP database unavailable after retries; country validation degraded', { geoipPath });
  }

  /**
   * Validate country using multi-factor verification
   * 
   * Scoring system:
   * - All 3 match: 100 (low risk)
   * - 2 of 3 match: 60 (medium risk)
   * - 1 or none match: 20 (high risk)
   */
  async validateCountry(request: GeographicDiscountRequest): Promise<CountryValidationResult> {
    const reasons: string[] = [];
    let confidence_score = 0;

    // Validate IP upfront (IPv4 or IPv6)
    if (!isValidIp(request.ip_address)) {
      return {
        is_valid: false,
        detected_country: null,
        ip_country: null,
        payment_country: request.payment_country || null,
        app_store_country: request.app_store_country || null,
        confidence_score: 0,
        risk_level: 'high',
        reasons: ['Invalid IP address'],
      };
    }

    // Factor 1: IP Geolocation
    const ip_country = await this.getCountryFromIP(request.ip_address);
    if (!ip_country) {
      reasons.push('Unable to determine country from IP address');
    }

    // Factor 2: Payment Method Country (from Stripe)
    const payment_country = request.payment_country;
    if (!payment_country) {
      reasons.push('No payment method country provided');
    }

    // Factor 3: App Store Country (optional but recommended)
    const app_store_country = request.app_store_country || null;

    // Calculate matches
    const countries = [ip_country, payment_country, app_store_country].filter(Boolean) as string[];
    const unique_countries = new Set(countries);

    if (unique_countries.size === 0) {
      return {
        is_valid: false,
        detected_country: null,
        ip_country,
        payment_country,
        app_store_country,
        confidence_score: 0,
        risk_level: 'high',
        reasons: ['No country data available'],
      };
    }

    // All factors match
    if (unique_countries.size === 1) {
      confidence_score = 100;
      reasons.push('All country indicators match');
      
      const detected_country = Array.from(unique_countries)[0];
      
      // Check if this is truly the first customer from this country
      const is_first_customer = await this.isFirstCustomerInCountry(
        detected_country,
        request.customer_id
      );

      if (!is_first_customer) {
        confidence_score -= 20;
        reasons.push('Not the first customer from this country');
      }

      return {
        is_valid: true,
        detected_country,
        ip_country,
        payment_country,
        app_store_country,
        confidence_score,
        risk_level: 'low',
        reasons,
      };
    }

    // 2 of 3 match
    if (unique_countries.size === 2) {
      confidence_score = 60;
      reasons.push('Country mismatch detected (2 of 3 indicators agree)');
      
      // Find the most common country
      const country_counts = new Map<string, number>();
      countries.forEach(country => {
        country_counts.set(country, (country_counts.get(country) || 0) + 1);
      });

      const detected_country = Array.from(country_counts.entries())
        .sort((a, b) => b[1] - a[1])[0][0];

      // Additional checks for VPN/proxy indicators
      const vpn_indicators = await this.checkVPNIndicators(request.ip_address);
      if (vpn_indicators.is_vpn) {
        confidence_score -= 30;
        reasons.push(`VPN/proxy detected: ${vpn_indicators.reason}`);
      }

      return {
        is_valid: confidence_score >= 50,
        detected_country,
        ip_country,
        payment_country,
        app_store_country,
        confidence_score,
        risk_level: 'medium',
        reasons,
      };
    }

    // All 3 different or 1 factor only
    confidence_score = 20;
    reasons.push('Significant country mismatch (all indicators differ)');
    reasons.push('Possible VPN/proxy usage or incorrect data');

    return {
      is_valid: false,
      detected_country: ip_country || payment_country || app_store_country || null,
      ip_country,
      payment_country,
      app_store_country,
      confidence_score,
      risk_level: 'high',
      reasons,
    };
  }

  /**
   * Get country from IP address using MaxMind GeoIP2
   */
  private async getCountryFromIP(ip_address: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.ipCountryCache.get(ip_address);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    if (!this.geoipReader) {
      logger.warn('[VPNDetection] GeoIP reader not initialized');
      return null;
    }

    try {
      // MaxMind GeoIP2 API uses city() which includes country
      const response = await this.geoipReader.city(ip_address);
      const value = response.country?.isoCode || null;
      this.ipCountryCache.set(ip_address, { value, expiresAt: now + this.cacheTtlMs });
      return value;
    } catch (error) {
      logger.warn('[VPNDetection] Failed to GeoIP city lookup', { ip: ip_address, error });
      return null;
    }
  }

  /**
   * Check if customer is first from this country
   */
  private async isFirstCustomerInCountry(
    country_code: string,
    customer_id: string
  ): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM customers
      WHERE country_code = $1
        AND id != $2
        AND created_at < (SELECT created_at FROM customers WHERE id = $2)
    `, [country_code, customer_id]);

    return result.rows[0].count === 0;
  }

  /**
   * Check for VPN/proxy indicators
   * 
   * Indicators:
   * - Known VPN IP ranges (from databases)
   * - Reverse DNS contains 'vpn', 'proxy', 'tor'
   * - Hosting provider IPs (AWS, GCP, Azure)
   * - Anonymous proxy databases
   */
  private async checkVPNIndicators(ip_address: string): Promise<{
    is_vpn: boolean;
    reason: string;
  }> {
    const hosting_providers = [
      'amazon', 'aws', 'google', 'azure', 'digitalocean', 'linode',
      'vultr', 'ovh', 'hetzner', 'cloudflare'
    ];

    const signals: string[] = [];
    let isVpn = false;

    const enrichmentSignals = await this.collectEnrichmentSignals(ip_address);
    if (enrichmentSignals.signals.length > 0) {
      signals.push(...enrichmentSignals.signals);
      if (enrichmentSignals.isVpn) {
        isVpn = true;
      }
    }

    // Parallelize reverse DNS and ASN lookups with cache and timeouts
    const [dnsRes, asnRes] = await Promise.allSettled([
      this.reverseLookupWithCache(ip_address),
      this.asnOrgLookupWithCache(ip_address),
    ]);

    if (dnsRes.status === 'fulfilled') {
      const hostnames = dnsRes.value;
      if (hostnames && hostnames.length > 0) {
        const hostname = hostnames[0].toLowerCase();
        if (hostname.includes('vpn') || hostname.includes('proxy') || hostname.includes('tor')) {
          signals.push(`Reverse DNS contains VPN/proxy indicator: ${hostname}`);
          isVpn = true;
        }
        for (const provider of hosting_providers) {
          if (hostname.includes(provider)) {
            signals.push(`IP hosted by ${provider} (likely VPN/proxy)`);
            isVpn = true;
            break;
          }
        }
      }
    } else {
      logger.debug('[VPNDetection] Reverse DNS failed', { ip: ip_address, error: dnsRes.reason });
    }

    if (asnRes.status === 'fulfilled') {
      const asn_org = (asnRes.value || '').toLowerCase();
      const vpn_providers = [
        'nordvpn', 'expressvpn', 'surfshark', 'cyberghost', 'pia',
        'mullvad', 'protonvpn', 'privatevpn', 'ipvanish', 'vyprvpn'
      ];
      for (const provider of vpn_providers) {
        if (asn_org.includes(provider)) {
          signals.push(`ASN belongs to VPN provider: ${provider}`);
          isVpn = true;
          break;
        }
      }
    } else {
      logger.debug('[VPNDetection] ASN lookup failed', { ip: ip_address, error: asnRes.reason });
    }

    if (!isVpn && signals.length === 0) {
      return { is_vpn: false, reason: 'No VPN/proxy indicators detected' };
    }

    return { is_vpn: isVpn, reason: signals.join('; ') };
  }

  private async collectEnrichmentSignals(ipAddress: string): Promise<{ isVpn: boolean; signals: string[] }> {
    try {
      await this.enrichmentService.initialize();
      const result = this.enrichmentService.lookupIp(ipAddress);

      const signals: string[] = [];
      let isVpn = false;

      if (result.isTorExitNode) {
        signals.push('Listed as Tor exit node');
        isVpn = true;
      }

      if (result.vpnMatches.length > 0) {
        signals.push(`Found in VPN/DC datasets: ${result.vpnMatches.join(', ')}`);
        isVpn = true;
      }

      if (result.cloudProviders.length > 0) {
        const providers = Array.from(new Set(result.cloudProviders)).join(', ');
        signals.push(`Hosted on cloud provider: ${providers}`);
        isVpn = true;
      }

      if (result.abuseMatches.length > 0) {
        const categories = Array.from(new Set(result.abuseMatches
          .map((match) => match.category)
          .filter((category) => category.length > 0)));
        const categoryText = categories.length > 0 ? ` (${categories.join(', ')})` : '';
        signals.push(`Abuse intelligence matches${categoryText}`);
      }

      if (result.asn?.organization) {
        const asnLabel = result.asn.asn > 0 ? `AS${result.asn.asn}` : 'ASN';
        signals.push(`Autonomous system: ${result.asn.organization} (${asnLabel})`);
      }

      return { isVpn, signals };
    } catch (error) {
      logger.warn('[VPNDetection] Failed to load enrichment signals', { ip: ipAddress, error });
      return { isVpn: false, signals: [] };
    }
  }

  /**
   * Log validation attempt for audit trail
   */
  async logValidation(
    customer_id: string,
    validation_result: CountryValidationResult
  ): Promise<void> {
    await this.pool.query(`
      INSERT INTO country_validation_log (
        customer_id, 
        ip_country, 
        payment_country, 
        app_store_country,
        detected_country,
        confidence_score,
        risk_level,
        is_valid,
        reasons,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    `, [
      customer_id,
      validation_result.ip_country,
      validation_result.payment_country,
      validation_result.app_store_country,
      validation_result.detected_country,
      validation_result.confidence_score,
      validation_result.risk_level,
      validation_result.is_valid,
      JSON.stringify(validation_result.reasons),
    ]);
  }

  /**
   * Get validation history for customer
   */
  async getValidationHistory(customer_id: string): Promise<CountryValidationLogEntry[]> {
    const result = await this.pool.query<{ 
      customer_id: string;
      ip_country: string | null;
      payment_country: string | null;
      app_store_country: string | null;
      detected_country: string | null;
      confidence_score: number | string;
      risk_level: 'low' | 'medium' | 'high';
      is_valid: boolean;
      reasons: unknown;
      created_at: Date;
    }>(`
      SELECT *
      FROM country_validation_log
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [customer_id]);

    return result.rows.map((row) => ({
      customer_id: row.customer_id,
      ip_country: row.ip_country,
      payment_country: row.payment_country,
      app_store_country: row.app_store_country,
      detected_country: row.detected_country,
      confidence_score: Number(row.confidence_score),
      risk_level: row.risk_level,
      is_valid: row.is_valid,
      reasons: parseReasons(row.reasons),
      created_at: row.created_at,
    }));
  }

  // Reverse DNS with cache + timeout
  private async reverseLookupWithCache(
    ip: string,
    timeoutMs: number = Math.max(200, parseInt(process.env.VPN_RDNS_TIMEOUT_MS || '500', 10))
  ): Promise<string[]> {
    const now = Date.now();
    const cached = this.reverseDnsCache.get(ip);
    if (cached && cached.expiresAt > now) return cached.value;

    const p = this.dnsReverse(ip);
    const timed = new Promise<string[]>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('rdns timeout')), timeoutMs);
      p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
    });

    try {
      const value = await timed;
      this.reverseDnsCache.set(ip, { value, expiresAt: now + this.cacheTtlMs });
      return value;
    } catch (err) {
      // cache negative result briefly to avoid hammering DNS
      this.reverseDnsCache.set(ip, { value: [], expiresAt: now + Math.min(2000, this.cacheTtlMs) });
      throw err;
    }
  }

  // ASN org lookup with cache
  private async asnOrgLookupWithCache(ip: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.asnOrgCache.get(ip);
    if (cached && cached.expiresAt > now) return cached.value;
    if (!this.geoipReader) return null;
    try {
      const res = await this.geoipReader.asn(ip);
      const value = res.autonomousSystemOrganization || null;
      this.asnOrgCache.set(ip, { value, expiresAt: now + this.cacheTtlMs });
      return value;
    } catch (e) {
      return null;
    }
  }
}

// ----- Helpers -----

// Simple IP validator for IPv4/IPv6
// Separate to make testing easy
export function isValidIp(ip: string): boolean {
  return isIP(ip) !== 0;
}


