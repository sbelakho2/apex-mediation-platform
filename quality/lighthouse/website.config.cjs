/**
 * Lighthouse budgets for Website marketing/docs routes
 * Produces reports under .lighthouse-website
 */
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/pricing',
        'http://localhost:3000/documentation',
        'http://localhost:3000/about',
        'http://localhost:3000/contact',
      ],
      // Run multiple samples so LHCI can report medians instead of single-run noise
      numberOfRuns: Number(process.env.LHCI_RUNS || 3),
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
      outputDir: '.lighthouse-website',
    },
  },
};
