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

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api/v1';
const TOKEN = __ENV.TOKEN || '';

export default function () {
  const payload = JSON.stringify({
    placementId: 'test-placement',
    adFormat: 'interstitial',
    floorCpm: 0,
    device: { platform: 'unity', osVersion: 'iOS 17', model: 'iPhone' },
    user: { country: 'US', language: 'en' },
    app: { id: 'app-1', name: 'demo', bundle: 'com.demo.app', version: '1.0' },
  });

  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;

  const res = http.post(`${BASE_URL}/rtb/bid`, payload, { headers });
  check(res, {
    'status is 200 or 204': (r) => r.status === 200 || r.status === 204,
  });

  sleep(0.2);
}
