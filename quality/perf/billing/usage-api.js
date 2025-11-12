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

export default function () {
  const url = `${API_BASE}/api/v1/billing/usage/current?organizationId=550e8400-e29b-41d4-a716-446655440000`;
  const res = http.get(url);
  check(res, {
    'status is 200/204': (r) => r.status === 200 || r.status === 204,
  });
  sleep(0.01);
}
