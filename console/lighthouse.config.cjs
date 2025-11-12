/**
 * Lighthouse budgets for Console critical routes (Billing & Transparency)
 * Run with: npm run lighthouse (ensure server is running)
 */
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000/billing/usage',
        'http://localhost:3000/billing/invoices',
        'http://localhost:3000/billing/settings',
        'http://localhost:3000/transparency',
      ],
      numberOfRuns: 1,
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
