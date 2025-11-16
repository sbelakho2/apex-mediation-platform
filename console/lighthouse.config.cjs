/**
 * Lighthouse budgets for Console critical routes (dashboard, fraud, billing, transparency)
 * Run with: npm run lighthouse (ensure server is running)
 */

const CRITICAL_ROUTES = [
  'http://localhost:3000/dashboard',
  'http://localhost:3000/fraud',
  'http://localhost:3000/placements',
  'http://localhost:3000/billing/usage',
  'http://localhost:3000/billing/invoices',
  'http://localhost:3000/billing/settings',
  'http://localhost:3000/transparency',
  'http://localhost:3000/transparency/summary',
]

module.exports = {
  ci: {
    collect: {
      url: CRITICAL_ROUTES,
      numberOfRuns: 1,
      settings: {
        preset: 'desktop',
        throttlingMethod: 'devtools',
        formFactor: 'desktop',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
        'max-potential-fid': ['warn', { numericValue: 200 }],
        'cumulative-layout-shift': ['error', { numericValue: 0.1 }],
        'largest-contentful-paint': ['error', { numericValue: 2500 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouse',
    },
  },
};
