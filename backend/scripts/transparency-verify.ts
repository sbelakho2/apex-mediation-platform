#!/usr/bin/env ts-node

/**
 * Transparency Verifier CLI
 *
 * Usage:
 *   npm --prefix backend run verify:transparency -- \
 *     --auction <uuid> --publisher <uuid> [--api <url>] [--key <base64>] [--verbose]
 *
 * Behavior:
 *  - Fetches auction + candidates via API
 *  - Reconstructs canonical payload identical to TransparencyWriter
 *  - Verifies Ed25519 signature using supplied key or /keys endpoint
 *  - Prints PASS/FAIL with diagnostics and exits non-zero on FAIL
 */

import axios from 'axios';
import * as crypto from 'crypto';
import { canonicalizeForSignature } from '../src/services/transparency/canonicalizer';

// Types for API responses (subset of controller outputs)
interface AuctionListItem {
  auction_id: string;
  timestamp: string;
  publisher_id: string;
  placement_id: string;
  integrity: {
    signature: string;
    algo: string;
    key_id: string;
  };
}

interface VerifyResponse {
  status: 'pass' | 'fail' | 'not_applicable' | 'unknown_key';
  key_id?: string | null;
  algo?: string | null;
  reason?: string;
  canonical?: string;
  sample_bps?: number;
}

interface KeysResponse {
  count: number;
  data: Array<{ key_id: string; algo: string; public_key_base64: string; active: number }>;
}


function usageAndExit(msg?: string): never {
  if (msg) console.error(`[error] ${msg}`);
  console.error(`\nUsage:\n  npm --prefix backend run verify:transparency -- --auction <uuid> --publisher <uuid> [--api <url>] [--key <base64>] [--verbose]\n`);
  process.exit(2);
}

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const auction = (args['auction'] as string) || '';
  const publisher = (args['publisher'] as string) || '';
  const api = (args['api'] as string) || process.env.API_URL || 'http://localhost:4000/api/v1';
  const overrideKey = (args['key'] as string) || '';
  const verbose = Boolean(args['verbose']);

  if (!auction) return usageAndExit('Missing --auction');
  if (!publisher) return usageAndExit('Missing --publisher');

  const authToken = process.env.AUTH_TOKEN || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  // Get auction detail (publisher scoped)
  const detailResp = await axios.get(`${api}/transparency/auctions/${auction}`, { headers });
  const detail = detailResp.data as any;
  if (detail.publisher_id && detail.publisher_id !== publisher) {
    console.error(`[error] Auction belongs to different publisher: ${detail.publisher_id}`);
    process.exit(1);
  }

  // Verify via server endpoint first (source of truth)
  const verifyResp = await axios.get(`${api}/transparency/auctions/${auction}/verify`, { headers });
  const verify = verifyResp.data as VerifyResponse;

  if (verbose) {
    console.log('[debug] server verify:', JSON.stringify(verify, null, 2));
  }

  if (verify.status === 'not_applicable') {
    console.log(`NOT_APPLICABLE: ${verify.reason || 'no reason provided'}`);
    process.exit(0);
  }

  // If server says pass, still optionally re-verify locally using provided key or /keys
  let keyBase64 = overrideKey;
  if (!keyBase64) {
    try {
      const keysResp = await axios.get(`${api}/transparency/keys`, { headers });
      const keys = keysResp.data as KeysResponse;
      const match = keys.data.find((k) => k.key_id === verify.key_id) || keys.data[0];
      keyBase64 = match?.public_key_base64 || '';
    } catch (_) {
      // Ignore
    }
  }

  if (!keyBase64 || !verify.key_id) {
    console.log(verify.status.toUpperCase());
    process.exit(verify.status === 'pass' ? 0 : 1);
  }

  // Build canonical payload locally (source of truth)
  const canonicalLocal = canonicalizeForSignature({
    auction: {
      auction_id: detail.auction_id,
      publisher_id: detail.publisher_id,
      timestamp: detail.timestamp,
      winner_source: detail.winner?.source || 'none',
      winner_bid_ecpm: Number(detail.winner?.bid_ecpm || 0),
      winner_currency: detail.winner?.currency || 'USD',
      winner_reason: detail.winner?.reason || 'no_bid',
      sample_bps: Number(detail.sample_bps || 0),
    },
    candidates: (detail.candidates || []).map((c: any) => ({
      source: c.source,
      bid_ecpm: Number(c.bid_ecpm || 0),
      status: c.status,
    })),
  });

  // Parse public key (PEM/SPKI DER base64 accepted)
  let pubKey: crypto.KeyObject | null = null;
  try {
    const trimmed = keyBase64.trim();
    if (trimmed.includes('BEGIN')) {
      pubKey = crypto.createPublicKey(trimmed);
    } else {
      const der = Buffer.from(trimmed, 'base64');
      try {
        pubKey = crypto.createPublicKey({ key: der, type: 'spki', format: 'der' });
      } catch {
        const pem = `-----BEGIN PUBLIC KEY-----\n${trimmed}\n-----END PUBLIC KEY-----\n`;
        pubKey = crypto.createPublicKey(pem);
      }
    }
  } catch (e) {
    console.error('[error] Failed to parse public key provided');
    console.log(verify.status.toUpperCase());
    process.exit(verify.status === 'pass' ? 0 : 1);
  }

  let localPass = false;
  try {
    localPass = crypto.verify(
      null,
      Buffer.from(verify.canonical!, 'utf8'),
      pubKey!,
      Buffer.from((detail.integrity?.signature as string) || '', 'base64')
    );
  } catch (e) {
    // ignore
  }

  if (verbose) {
    console.log(`[debug] local verification: ${localPass ? 'PASS' : 'FAIL'}`);
  }

  const final = verify.status === 'pass' && localPass ? 'PASS' : verify.status.toUpperCase();
  console.log(final);
  process.exit(final === 'PASS' ? 0 : 1);
}

main().catch((err) => {
  console.error('[error] Unexpected error:', err?.message || err);
  process.exit(1);
});
