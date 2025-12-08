import http from 'k6/http';
import { sleep } from 'k6';

// K6 soak test script (default: 5 VUs, 60 minutes)
// Usage example:
//   BASE_URL=https://api.apexmediation.ee k6 run scripts/ops/k6/load.js
// Customize via env vars: VUS, DURATION, SLEEP

const BASE_URL = __ENV.BASE_URL || 'https://api.apexmediation.ee';
export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: String(__ENV.DURATION || '60m'),
};

export default function () {
  // Hit health endpoint (cheap) as a proxy for soak infrastructure
  const res = http.get(`${BASE_URL}/health`);
  // Optionally add a ready probe as a second sample
  http.get(`${BASE_URL}/ready`);
  // Small think time to keep ~1-5 RPS aggregate depending on VUs
  const s = Number(__ENV.SLEEP || 0.2);
  sleep(isNaN(s) ? 0.2 : s);
}
