import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '1m',
  thresholds: {
    http_req_duration: [
      'p(95)<120', // p95 under 120ms for auction endpoint (display)
    ],
  },
};

const API_BASE_URL = stripTrailingSlash(__ENV.API_BASE_URL || __ENV.BASE_URL || 'http://localhost:4000/api/v1');
const TOKEN = (__ENV.TOKEN || '').trim();

export default function () {
  const payload = JSON.stringify(buildAuctionPayload());

  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) {
    headers['Authorization'] = TOKEN.startsWith('Bearer ') ? TOKEN : `Bearer ${TOKEN}`;
  }

  const res = http.post(`${API_BASE_URL}/rtb/bid`, payload, { headers });
  check(res, {
    'status is 200 or 204': (r) => r.status === 200 || r.status === 204,
  });

  sleep(0.2);
}

function stripTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function buildAuctionPayload() {
  return {
    requestId: `auction-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    placementId: __ENV.PLACEMENT_ID || 'k6-loadtest-placement',
    adFormat: __ENV.AD_FORMAT || 'interstitial',
    floorCpm: Number(__ENV.FLOOR_CPM || 0),
    device: {
      platform: __ENV.DEVICE_PLATFORM || 'ios',
      osVersion: __ENV.DEVICE_OS_VERSION || '17.0',
      model: __ENV.DEVICE_MODEL || 'iPhone15,4',
    },
    user: {
      country: __ENV.USER_COUNTRY || 'US',
      language: __ENV.USER_LANGUAGE || 'en',
    },
    app: {
      id: __ENV.APP_ID || 'app.k6.loadtest',
      name: __ENV.APP_NAME || 'K6 Load Test',
      bundle: __ENV.APP_BUNDLE || 'com.apexmediation.loadtest',
      version: __ENV.APP_VERSION || '1.0.0',
    },
  };
}
