Rival Apex Mediation Web SDK

A lightweight browser SDK for consent, auction requests, and ad delivery integration.

Public API
- init(options): initialize the SDK with endpoint and optional metadata.
- setConsent(consent): set/update consent flags (GDPR/TCF, CCPA/USP, GPP, COPPA).
- requestAd(request): POSTs to {endpoint}/auction with AbortController timeout and validates response.
- on(event, handler): subscribe to SDK events (consent:updated, ad:requested, ad:filled, ad:error).

Build outputs
- ESM: dist/index.esm.js
- UMD: dist/index.umd.js
- Types: dist/src/index.d.ts

Commands
- npm run lint
- npm run build
- npm run test -- --coverage

Notes
- Fetch timeouts are enforced with AbortController (default 2000ms).
- Response validation uses zod to ensure schema correctness.
- Error taxonomy mirrors mobile SDKs (INIT_REQUIRED, TIMEOUT, NETWORK, BAD_RESPONSE, VALIDATION, NO_FILL, UNKNOWN).
