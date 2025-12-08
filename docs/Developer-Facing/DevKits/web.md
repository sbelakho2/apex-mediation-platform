### Web Adapter Dev Kit (BYO-first)

Purpose
- Define how to integrate your own web ad stack (e.g., Prebid.js, Google Ad Manager) with ApexMediation without bundling third‑party scripts in the core.

Key guarantees
- Core web SDK does not ship third‑party bundles. Publishers bring their own tags.
- Single entry and simple consent snapshotting remain consistent with native SDKs.
- Transparency and privacy requirements match `DATA_FLOW_AND_COMPLIANCE.md`.

Adapter interface (concept)
```ts
export interface WebAdAdapter {
  readonly name: string
  init(config: Record<string, unknown>): Promise<void>
  loadAd(slotId: string, config: SlotConfig): Promise<AdResult>
  renderAd(container: HTMLElement, ad: AdResult): void
}
```

BYO example (Prebid wrapper sketch)
```ts
import type { WebAdAdapter } from '@apexmediation/core-web'

export const PrebidAdapter: WebAdAdapter = {
  name: 'prebid',
  async init(cfg) {
    // Ensure prebid.js is on the page (publisher-supplied); configure bidders with cfg
  },
  async loadAd(slotId, cfg) {
    // Run prebid auction for slotId and return a normalized AdResult with price & creative
    return { id: `hb-${slotId}`, price: 1.23, creativeHtml: '<div>...</div>', meta: {} }
  },
  renderAd(container, ad) {
    container.innerHTML = ad.creativeHtml
  }
}
```

Consent & privacy
- Provide a consent snapshot (TCF/USP/COPPA/LAT) alongside calls; map to your adapter’s APIs.
- Do not expose raw device identifiers; follow hashing/redaction rules in `docs/Internal/Transparency/DATA_FLOW_AND_COMPLIANCE.md`.

Testing
- Use Jest/Playwright to validate adapter behavior and rendering.
- Verify exactly‑once event flows and error taxonomy mapping where applicable.

Links
- Core guide: `docs/Developer-Facing/AdapterDevKit.md`
- Data/Privacy: `docs/Internal/Transparency/DATA_FLOW_AND_COMPLIANCE.md`
