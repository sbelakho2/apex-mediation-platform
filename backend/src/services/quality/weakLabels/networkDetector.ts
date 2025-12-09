/**
 * Network/IP Traffic Quality Detector
 * 
 * Detects datacenter, VPN, Tor, and proxy traffic using IP intelligence.
 * Uses multiple data sources for accuracy.
 * 
 * IMPORTANT: These are weak labels for training, NOT for blocking traffic.
 */

import { WeakLabel, LabelConfidence, scoreToConfidence } from './types';
import logger from '../../../utils/logger';

// Known datacenter ASN prefixes (sample - in production, use a full database)
const KNOWN_DATACENTER_ASNS = new Set([
  'AS14061', // DigitalOcean
  'AS16276', // OVH
  'AS14618', // Amazon AWS
  'AS15169', // Google Cloud
  'AS8075',  // Microsoft Azure
  'AS13335', // Cloudflare
  'AS20940', // Akamai
  'AS396982', // Google Cloud
  'AS16509', // Amazon
  'AS45102', // Alibaba
  'AS37963', // Alibaba
  'AS132203', // Tencent
]);

// Common VPN provider domains and identifiers
const VPN_INDICATORS = [
  'nordvpn', 'expressvpn', 'surfshark', 'cyberghost', 'pia', 
  'privateinternetaccess', 'mullvad', 'protonvpn', 'ipvanish',
  'vyprvpn', 'tunnelbear', 'windscribe', 'hotspotshield',
];

// Tor exit node detection patterns
const TOR_PATTERNS = {
  exitNodeHostname: /^exit\d*\.|\.tor-exit\.|\.torservers\./i,
  knownPorts: [9001, 9030, 9050, 9051],
};

export interface NetworkSignals {
  ip: string;
  asn?: string;
  asnName?: string;
  hostname?: string;
  isProxy?: boolean;
  isVpn?: boolean;
  isTor?: boolean;
  isDatacenter?: boolean;
  connectionType?: 'residential' | 'mobile' | 'business' | 'hosting';
  country?: string;
  riskScore?: number; // From external IP intelligence service
}

/**
 * Check if ASN is a known datacenter
 */
export function isDatacenterASN(asn: string | undefined): boolean {
  if (!asn) return false;
  return KNOWN_DATACENTER_ASNS.has(asn.toUpperCase());
}

/**
 * Check if hostname indicates VPN service
 */
export function isVpnHostname(hostname: string | undefined): boolean {
  if (!hostname) return false;
  const lower = hostname.toLowerCase();
  return VPN_INDICATORS.some(indicator => lower.includes(indicator));
}

/**
 * Check if hostname matches Tor exit node patterns
 */
export function isTorExitHostname(hostname: string | undefined): boolean {
  if (!hostname) return false;
  return TOR_PATTERNS.exitNodeHostname.test(hostname);
}

/**
 * Detect datacenter traffic
 */
export function detectDatacenterTraffic(signals: NetworkSignals): WeakLabel | null {
  // Direct flag from IP intelligence
  if (signals.isDatacenter === true) {
    return {
      category: 'datacenter_traffic',
      confidence: 'high',
      confidenceScore: 0.85,
      reason: 'ip_intelligence_datacenter',
      metadata: { 
        ip: maskIP(signals.ip),
        asn: signals.asn,
        asnName: signals.asnName,
      },
      detectedAt: new Date(),
    };
  }
  
  // ASN-based detection
  if (isDatacenterASN(signals.asn)) {
    return {
      category: 'datacenter_traffic',
      confidence: 'high',
      confidenceScore: 0.8,
      reason: 'datacenter_asn',
      metadata: { 
        ip: maskIP(signals.ip),
        asn: signals.asn,
        asnName: signals.asnName,
      },
      detectedAt: new Date(),
    };
  }
  
  // Connection type from IP intelligence
  if (signals.connectionType === 'hosting') {
    return {
      category: 'datacenter_traffic',
      confidence: 'medium',
      confidenceScore: 0.7,
      reason: 'hosting_connection_type',
      metadata: { 
        ip: maskIP(signals.ip),
        connectionType: signals.connectionType,
      },
      detectedAt: new Date(),
    };
  }
  
  return null;
}

/**
 * Detect VPN usage
 */
export function detectVpnTraffic(signals: NetworkSignals): WeakLabel | null {
  // Direct flag from IP intelligence
  if (signals.isVpn === true) {
    return {
      category: 'vpn_detected',
      confidence: 'high',
      confidenceScore: 0.85,
      reason: 'ip_intelligence_vpn',
      metadata: { 
        ip: maskIP(signals.ip),
        asn: signals.asn,
      },
      detectedAt: new Date(),
    };
  }
  
  // Hostname-based detection
  if (isVpnHostname(signals.hostname)) {
    return {
      category: 'vpn_detected',
      confidence: 'medium',
      confidenceScore: 0.65,
      reason: 'vpn_hostname_pattern',
      metadata: { 
        ip: maskIP(signals.ip),
        hostname: signals.hostname,
      },
      detectedAt: new Date(),
    };
  }
  
  // Proxy flag (could be VPN)
  if (signals.isProxy === true && !signals.isDatacenter) {
    return {
      category: 'vpn_detected',
      confidence: 'low',
      confidenceScore: 0.5,
      reason: 'proxy_detected_possible_vpn',
      metadata: { 
        ip: maskIP(signals.ip),
      },
      detectedAt: new Date(),
    };
  }
  
  return null;
}

/**
 * Detect Tor exit node traffic
 */
export function detectTorTraffic(signals: NetworkSignals): WeakLabel | null {
  // Direct flag from IP intelligence
  if (signals.isTor === true) {
    return {
      category: 'tor_exit_node',
      confidence: 'very_high',
      confidenceScore: 0.95,
      reason: 'ip_intelligence_tor',
      metadata: { 
        ip: maskIP(signals.ip),
      },
      detectedAt: new Date(),
    };
  }
  
  // Hostname-based detection
  if (isTorExitHostname(signals.hostname)) {
    return {
      category: 'tor_exit_node',
      confidence: 'high',
      confidenceScore: 0.8,
      reason: 'tor_exit_hostname_pattern',
      metadata: { 
        ip: maskIP(signals.ip),
        hostname: signals.hostname,
      },
      detectedAt: new Date(),
    };
  }
  
  return null;
}

/**
 * Run all network quality checks
 */
export function detectNetworkAnomalies(signals: NetworkSignals): WeakLabel[] {
  const labels: WeakLabel[] = [];
  
  try {
    const datacenterLabel = detectDatacenterTraffic(signals);
    if (datacenterLabel) labels.push(datacenterLabel);
    
    const vpnLabel = detectVpnTraffic(signals);
    if (vpnLabel) labels.push(vpnLabel);
    
    const torLabel = detectTorTraffic(signals);
    if (torLabel) labels.push(torLabel);
    
  } catch (error) {
    logger.warn('Network anomaly detection error', { error, ip: maskIP(signals.ip) });
  }
  
  return labels;
}

/**
 * Mask IP for logging (privacy)
 */
function maskIP(ip: string): string {
  if (!ip) return 'unknown';
  // Mask last octets
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  // IPv6
  if (ip.includes(':')) {
    return ip.substring(0, Math.min(ip.length, 12)) + '::xxx';
  }
  return 'masked';
}

// Export for testing
export const _internal = {
  maskIP,
  KNOWN_DATACENTER_ASNS,
  VPN_INDICATORS,
  TOR_PATTERNS,
};
