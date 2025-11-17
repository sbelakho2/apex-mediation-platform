import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const fraudScoreLatency = new Trend('fraud_score_latency_ms', true);
const fraudScoreErrors = new Rate('fraud_score_errors');
const highFraudRate = new Rate('high_fraud_predictions');

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Warm-up
    { duration: '2m', target: 50 },   // Ramp to moderate load
    { duration: '1m', target: 100 },  // Peak load
    { duration: '30s', target: 0 },   // Cool down
  ],
  thresholds: {
    'fraud_score_latency_ms': ['p(95)<50', 'p(99)<100'],  // p95 < 50ms, p99 < 100ms
    'fraud_score_errors': ['rate<0.01'],  // Error rate < 1%
    'http_req_duration': ['p(95)<150'],   // Overall p95 < 150ms
    'http_req_failed': ['rate<0.01'],     // < 1% failed requests
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const SUMMARY_FILE = __ENV.FRAUD_SUMMARY_FILE || __ENV.K6_SUMMARY_PATH || '/tmp/k6-fraud-smoke-results.json';

export function setup() {
  // Verify service is ready before test
  const healthRes = http.get(`${BASE_URL}/health/ready`);
  if (healthRes.status !== 200) {
    throw new Error(`Service not ready: ${healthRes.status}`);
  }
  console.log('✓ Service ready for testing');
  if (SUMMARY_FILE === 'none') {
    console.log('ℹ️  Summary file disabled; only stdout will be written.');
  } else {
    console.log(`ℹ️  Summary artifacts will be written to ${SUMMARY_FILE}`);
  }
}

export default function () {
  group('Single Fraud Score', () => {
    const payload = JSON.stringify({
      feature_1: Math.random() * 10,
      feature_2: Math.random() * 5,
      feature_3: Math.random() * 2,
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { name: 'FraudScore' },
    };

    const res = http.post(`${BASE_URL}/v1/score`, payload, params);

    const success = check(res, {
      'status is 200': (r) => r.status === 200,
      'has fraud_score': (r) => JSON.parse(r.body).fraud_score !== undefined,
      'fraud_score in range': (r) => {
        const score = JSON.parse(r.body).fraud_score;
        return score >= 0 && score <= 1;
      },
      'has latency_ms': (r) => JSON.parse(r.body).latency_ms !== undefined,
    });

    fraudScoreErrors.add(!success);

    if (success) {
      const body = JSON.parse(res.body);
      fraudScoreLatency.add(body.latency_ms);
      highFraudRate.add(body.is_fraud ? 1 : 0);
    }
  });

  sleep(0.1);
}

export function handleSummary(data) {
  const timestamp = new Date().toISOString();
  
  // Extract key metrics
  const summary = {
    timestamp,
    test_duration_seconds: data.state.testRunDurationMs / 1000,
    total_requests: data.metrics.http_reqs.values.count,
    failed_requests: data.metrics.http_req_failed.values.rate,
    latency: {
      p50: data.metrics.http_req_duration.values['p(50)'],
      p95: data.metrics.http_req_duration.values['p(95)'],
      p99: data.metrics.http_req_duration.values['p(99)'],
      max: data.metrics.http_req_duration.values.max,
    },
    fraud_score_latency: {
      p50: data.metrics.fraud_score_latency_ms?.values['p(50)'] || null,
      p95: data.metrics.fraud_score_latency_ms?.values['p(95)'] || null,
      p99: data.metrics.fraud_score_latency_ms?.values['p(99)'] || null,
    },
    error_rate: data.metrics.fraud_score_errors?.values?.rate || 0,
    thresholds_passed: Object.keys(data.metrics).filter(
      (k) => data.metrics[k].thresholds && 
             Object.values(data.metrics[k].thresholds).every(t => t.ok)
    ).length,
    thresholds_failed: Object.keys(data.metrics).filter(
      (k) => data.metrics[k].thresholds && 
             Object.values(data.metrics[k].thresholds).some(t => !t.ok)
    ).length,
  };

  const outputs = {
    stdout: JSON.stringify(summary, null, 2),
  };

  if (SUMMARY_FILE && SUMMARY_FILE !== 'none') {
    outputs[SUMMARY_FILE] = JSON.stringify(data, null, 2);
  }

  return outputs;
}
