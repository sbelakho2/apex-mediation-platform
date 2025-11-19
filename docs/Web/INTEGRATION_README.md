Web Integration With Apex Mediation

Overview
- The Web SDK does not embed mobile vendor SDKs. Instead, Apex Mediation integrates partner networks on the backend and returns creatives (HTML/VAST) to the browser via the Web SDK.
- All 15 networks are “accessible” for web via the server‑side mediation layer, while the Web SDK focuses on consent propagation, request/response validation, and rendering.

Supported Networks (15)
- AdMob, AppLovin, Unity Ads, ironSource, Facebook (Meta Audience Network), Vungle, Chartboost, Pangle, Mintegral, AdColony, Tapjoy, Moloco, Fyber, Smaato, Amazon Publisher Services.

How it works
1. Your page initializes the Web SDK and sets consent if applicable.
2. The Web SDK issues a POST to {endpoint}/auction with request, consent, and metadata (publisher/app identifiers, SDK/version).
3. The backend mediation service routes the request across configured partner adapters, applies auction logic, and returns a single winning creative.
4. The Web SDK validates the response and hands the creative back to the site for rendering.

What the Web SDK provides
- Public API: init, setConsent, requestAd, on(event) — see packages/web-sdk/README.md for usage.
- Schema validation using zod for all payloads.
- Error taxonomy aligned with mobile SDKs (INIT_REQUIRED, TIMEOUT, NETWORK, BAD_RESPONSE, VALIDATION, NO_FILL, UNKNOWN).
- List of supported networks via SUPPORTED_NETWORKS and getSupportedAdapters() exports for parity documentation.

Consent and privacy
- The Web SDK forwards GDPR/TCF, CCPA/USP, GPP, and COPPA flags to the backend. Partner‑specific consent behaviors are handled in backend adapters.

Customer steps for web integration
- Include or bundle @rivalapex/web-sdk and initialize with your endpoint and identifiers.
- Provide consent strings when available via setConsent().
- Call requestAd() to receive a validated creative payload and render it in your placement.
- For video (VAST), use your existing player with the provided VAST tag/URL.

Notes
- Because third‑party vendor JavaScript SDKs differ significantly from their mobile SDKs and may impose CSP/privacy constraints, Apex Mediation’s production path for web is server‑side.
- Platform parity: All 15 networks are represented in the supported networks list and mediated server‑side. Availability is subject to publisher approval and partner policies.

Related documentation
- docs/Adapters/SUPPORTED_NETWORKS.md — Cross‑platform supported networks and code locations.
- docs/Internal/SANDBOX_TESTING_READINESS_2025-11-13.md — Overall readiness checklist and CI evidence.
