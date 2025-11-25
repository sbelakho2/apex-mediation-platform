// Proxy to the canonical CJS config so npm scripts that default to
// jest.config.js still pick up the shared setup (env defaults, ignores, etc.).
/* eslint-disable @typescript-eslint/no-var-requires */
module.exports = require('./jest.config.cjs');
