import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api/v1';

// This test assumes you have a valid imp/click token to reuse in a tight loop for throughput testing.
// Provide via env: TOKEN_IMP and TOKEN_CLICK; otherwise requests will 400 which still exercises limiter path.
const TOKEN_IMP = __ENV.TOKEN_IMP || '';
const TOKEN_CLICK = __ENV.TOKEN_CLICK || '';

export default function () {
  const imp = http.get(`${BASE_URL}/rtb/t/imp?token=${encodeURIComponent(TOKEN_IMP)}`);
  check(imp, { 'imp status ok-ish': (r) => r.status === 204 || r.status === 400 || r.status === 429 });

  const click = http.get(`${BASE_URL}/rtb/t/click?token=${encodeURIComponent(TOKEN_CLICK)}`);
  check(click, { 'click status ok-ish': (r) => r.status === 302 || r.status === 400 || r.status === 429 });

  sleep(0.05);
}
