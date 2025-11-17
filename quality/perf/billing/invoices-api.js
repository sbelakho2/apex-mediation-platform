import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  thresholds: {
    http_req_failed: ['rate<0.001'], // < 0.1%
    http_req_duration: ['p(95)<200'], // p95 < 200ms
  },
  scenarios: {
    steady_100rps: {
      executor: 'constant-arrival-rate',
      rate: 100, // RPS
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
};

const API_BASE = __ENV.API_BASE || 'http://localhost:4000';
const ORGANIZATION_ID = __ENV.BILLING_ORG_ID || __ENV.ORGANIZATION_ID;
const PAGE = __ENV.BILLING_INVOICES_PAGE || '1';
const LIMIT = __ENV.BILLING_INVOICES_LIMIT || '20';

if (!ORGANIZATION_ID) {
  throw new Error('Set BILLING_ORG_ID (or ORGANIZATION_ID) to a valid tenant UUID before running the invoices perf test.');
}

export default function () {
  const url = `${API_BASE}/api/v1/billing/invoices?organizationId=${encodeURIComponent(
    ORGANIZATION_ID,
  )}&page=${PAGE}&limit=${LIMIT}`;
  const res = http.get(url);
  check(res, {
    'status is 200/204': (r) => r.status === 200 || r.status === 204,
  });
  sleep(0.01);
}
