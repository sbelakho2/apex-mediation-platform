import http from 'k6/http'
import { check, sleep } from 'k6'

const etagCache = new Map()

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '1m',
  thresholds: {
    http_req_duration: ['p(95)<300'], // p95 < 300ms
    http_req_failed: ['rate<0.001'], // < 0.1%
  },
}

export default function () {
  const baseApi = __ENV.BASE_API || 'http://localhost:4000/api/v1'
  const invoiceId = __ENV.INVOICE_ID || 'inv_k6_example'
  const url = `${baseApi}/billing/invoices/${invoiceId}/pdf`

  const headers = { Accept: 'application/pdf' }
  // Simulate client ETag caching by keeping ETag per virtual user instead of mutating globals
  const vuKey = String(__VU || 0)
  const initialEtag = etagCache.get(vuKey) || __ENV.K6_ETAG || ''
  if (initialEtag) headers['If-None-Match'] = initialEtag

  const res = http.get(url, { headers })

  check(res, {
    'status is 200 or 304': (r) => r.status === 200 || r.status === 304,
    'content-type is pdf (on 200)': (r) => r.status === 304 || (r.headers['Content-Type'] || '').includes('application/pdf'),
  })

  // Save ETag for next iteration in this VU
  const newEtag = res.headers['ETag']
  if (newEtag) {
    etagCache.set(vuKey, newEtag)
  }

  sleep(1)
}
