/**
 * Minimal Jest config for Website to run JavaScript tests only.
 * We deliberately skip TypeScript transforms to keep it lightweight.
 */
module.exports = {
  testEnvironment: 'node',
  verbose: true,
  testMatch: ['**/src/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['\\.ts$', '/node_modules/'],
  passWithNoTests: false,
};