High-level “BYO-only” impact map
Area	What changes now	Why it matters	Future-proofing (Managed Demand later)
SDKs & Adapters	No storage of network secrets in SDK or console. SDK only forwards publisher app/site IDs and consent.	BYO means publishers hold network relationships & payouts. You mediate logic + transparency, not custody.	Keep adapter interfaces stable. Later, allow optional MD “house” account IDs via server flags without touching SDK API.
Services (Auction, ML)	All APIs become tenant-aware (publisher scoped) via header/JWT claims; no shared credentials. Add transparent signature feeds & replay endpoints.	Cryptographic transparency + BYO means all decisions trace to per-tenant context.	Add optional server “house seats” behind feature flags.
Fraud	Ship shadow-mode scoring now; block-mode gated by metrics/PII policy. Training data is tenant-isolated.	BYO must not silently block real revenue. Shadow mode de-risks.	Promotion to block-mode is a flag per tenant.
Console	Credentials UI becomes reference/validation only (IDs/placement keys), not secrets vault. Add tenant headers, consent/ATT matrices, auction trace, payout-agnostic ledgers.	You’re not a payment intermediary in BYO.	Keep the “Payments” nav but grey it until MD.
Infra	Helm values: enable multi-tenant headers, JWT validation, resource limits; add canary, SLOs, rate-limits per tenant.	Stability & isolation.	Add “MD rails” chart later with secrets.
Quality	E2E that proves no secrets are persisted, auction deadlines honored with partial aggregation, and trace integrity.	Prevent regressions to MD assumptions.	Extend testpacks when MD arrives.
SERVICES
A) services/inference-ml/ (general inference—CTR/bid/etc.)

Goal (BYO): Tenant-aware inference APIs, cryptographic transparency hooks, and no shared/central network auth.

Pinpoint changes

1) Add per-tenant scoping and request signing to every scoring endpoint

File: services/inference-ml/main.py

Add/modify:

Ensure tenant header is required on all endpoints and plumbed through metrics.

Validate JWT claims include aud & roles ∈ {publisher,admin}; reject otherwise.

# top-level env (already present in fraud-inference; mirror here)
TENANT_HEADER = os.getenv("INFERENCE_TENANT_HEADER", "X-Publisher-Id")

def _require_tenant(request: Request) -> str:
    tenant = request.headers.get(TENANT_HEADER)
    if not tenant:
        raise HTTPException(status_code=400, detail=f"Missing {TENANT_HEADER}")
    return tenant

@app.post("/v1/score/fraud")
async def score_fraud(req: FraudDetectionRequest, request: Request, user: AuthUser = Depends(require_auth)):
    tenant = _require_tenant(request)
    # attach tenant to logs/metrics
    FRAUD_REQS.labels(tenant=tenant).inc()
    # ...


Accept/Fail Criteria

✅ Requests without X-Publisher-Id → 400.

✅ JWT without allowed role → 403.

✅ All Prometheus metrics export {tenant="<id>"} labels.

2) Add “auction transparency receipt” (hash chain) utility used by auction path

File: services/inference-ml/main.py

Add module-level helper:

def make_transparency_receipt(tenant: str, req_payload: dict, rsp_payload: dict, secret: str) -> dict:
    blob = json.dumps({"t": tenant, "req": req_payload, "rsp": rsp_payload}, separators=(",", ":"), sort_keys=True)
    sig = hmac.new(secret.encode("utf-8"), blob.encode("utf-8"), hashlib.sha256).hexdigest()
    return {"hash": hashlib.sha256(blob.encode()).hexdigest(), "sig": sig, "algo": "HMAC-SHA256"}


Env:

TRANSPARENCY_SECRET (K8s secret; set in Helm)

Accept/Fail Criteria

✅ Every scoring response includes transparency_receipt.

✅ Re-compute locally reproduces the same hash.

3) Add “replay” endpoint to verify auction decisions off-line

File: services/inference-ml/main.py

Add:

@app.post("/v1/replay/auction")
async def replay_auction(payload: AuctionReplayRequest, request: Request, user: AuthUser = Depends(require_auth)):
    tenant = _require_tenant(request)
    # Re-run selection logic deterministically (no network) using payload.snapshots
    # Return winner + landscape + receipt


Accept/Fail Criteria

✅ Given captured snapshots, the replay result is deterministic & matches the prior receipt hash.

4) Harden model registry to not auto-load managed-demand models

File: services/inference-ml/main.py

Change: when scanning models/, only load types in allow-list:

ALLOWED_MODELS = os.getenv("ALLOWED_MODELS", "fraud,ctr").split(",")
# while registering registry entries:
if handle.name not in ALLOWED_MODELS: continue


Accept/Fail Criteria

✅ Only fraud & ctr show in /models now.

B) services/fraud-inference/ (specialized fraud service)

Goal (BYO): Tenant-isolated shadow-mode scoring; promotion to block-mode via config; consent + privacy fields propagated.

Pinpoint changes

1) Enforce tenant header + consent passthrough

File: services/fraud-inference/main.py

Add:

TENANT_HEADER = os.getenv("INFERENCE_TENANT_HEADER", "X-Publisher-Id")

class FraudDetectionRequest(BaseModel):
    # existing…
    consent_gdpr: Optional[bool] = None
    consent_tcf: Optional[str] = None
    us_privacy: Optional[str] = None
    coppa: Optional[bool] = None


Wire consent into features (where you build the feature vector) and log redacted copies.

Accept/Fail Criteria

✅ Missing tenant header → 400.

✅ PII redaction verified in debug ring buffer tests.

2) Default to shadow mode; promotion guardrails

File: services/fraud-inference/main.py

Add env & logic:

DEFAULT_FRAUD_MODE = os.getenv("FRAUD_MODE", "shadow")  # "shadow"|"block"
TENANT_MODE_OVERRIDES = json.loads(os.getenv("FRAUD_MODE_OVERRIDES_JSON", "{}"))

def mode_for(tenant: str) -> str:
    return TENANT_MODE_OVERRIDES.get(tenant, DEFAULT_FRAUD_MODE)


Accept/Fail Criteria

✅ “block” applied only if override present in configmap/secret.

✅ Reverting to “shadow” is one config flip (no deploy).

3) Add drift monitors + score distribution histograms per tenant

File: services/fraud-inference/main.py

Add metrics: fraud_score_histogram{tenant,model}, fraud_drift_js_divergence{tenant} updated every N minutes.

Accept/Fail Criteria

✅ Prometheus exports live.

✅ Console can chart drift per tenant.

CONSOLE (Next.js)

(Repo seen at /mnt/data/extracted/console/console, pages exist for Observability/Transparency/Settings)

Goal (BYO): No secrets vault; credentials screens become ids/validation only; add tenant header everywhere; expose transparency receipts and fraud shadow-mode surfaces.

Pinpoint changes

1) Inject tenant header in API client

File: console/src/lib/auctionApi.ts (or your API client lib)

Modify:

export function withTenant(headers: HeadersInit = {}): HeadersInit {
  const tid = getActiveTenantId(); // from session/org switcher
  return { ...headers, "X-Publisher-Id": tid };
}


Use withTenant() in every fetch() to /v1/*.

Accept/Fail Criteria

✅ All requests include X-Publisher-Id.

✅ 403 if removed (to prove server guards are active).

2) Settings → Credentials page becomes “BYO mapper”, not secret storage

File: console/src/app/**/settings/credentials/page.tsx

Change copy & form:

Inputs are Publisher Account IDs / App IDs / Placement IDs per network.

No secret fields (keys/tokens) in BYO; if a network requires secret for S2S bids, show “enter directly in the app or in the network’s dashboard” guidance.

Add “Verify” button that pings network public verification endpoints or test ads (no secret storage).

Accept/Fail Criteria

✅ Saving writes to a tenant-scoped config document in your config service (no KMS/secrets object).

✅ Redaction test ensures nothing named key, secret, token is stored.

3) Transparency views

Files:

console/src/app/**/transparency/auctions/page.tsx

console/src/app/**/transparency/auctions/[auction_id]/page.tsx

Add:

Column for transparency_hash & sig.

“Replay” button → calls /v1/replay/auction with captured snapshot.

Accept/Fail Criteria

✅ Clicking Replay shows identical winner & hash.

4) Fraud shadow-mode dashboard

File: console/src/app/**/fraud/page.tsx

Add:

Per-tenant score histograms, drift trend, weak-label correlation cards.

“Promotion suggestion” widget (reads metrics JSON published by service).

Accept/Fail Criteria

✅ Shows “Shadow Mode” banner until override.

5) Payments page

File: console/src/app/**/settings/payouts/page.tsx

Change:

Copy → “BYO: payments handled by your ad networks.”

Provide export of revenue logs / reconciliations (no balances).

Accept/Fail Criteria

✅ No balances stored server-side.

INFRASTRUCTURE

Goal (BYO): Multi-tenant, secure defaults, and ops SLOs. No payment rails in this phase.

Helm charts

1) Backend/Inference charts – add tenant header & auth envs

Files:

infrastructure/helm/backend/values.yaml

infrastructure/helm/fraud-inference/values.yaml

infrastructure/helm/console/values.yaml

Add values:

env:
  INFERENCE_TENANT_HEADER: "X-Publisher-Id"
  JWT_AUDIENCE: "apexmediation"
  INFERENCE_ALLOWED_ROLES: "admin,publisher,readonly"
  TRANSPARENCY_SECRET: "{{ .Values.secrets.transparency }}"
  FRAUD_MODE: "shadow"
  ALLOWED_MODELS: "fraud,ctr"
resources:
  requests: { cpu: "200m", memory: "256Mi" }
  limits:   { cpu: "1",    memory: "1Gi" }
readinessProbe: { httpGet: { path: /health, port: 8000 }, initialDelaySeconds: 5, periodSeconds: 10 }
livenessProbe:  { httpGet: { path: /health, port: 8000 }, initialDelaySeconds: 10, periodSeconds: 20 }


Accept/Fail Criteria

✅ Pods fail to start without TRANSPARENCY_SECRET.

✅ Probes green within 10s on healthy boot.

2) Canary & rate-limit

File: infrastructure/helm/backend/templates/*ingress* or gateway config

Add:

Canary annotations / traffic split.

Global rate-limit per tenant: 300 req/60s (env already in fraud-inference—mirror in backend).

Accept/Fail Criteria

✅ Canary 5% traffic route works (observed via metrics).

✅ 429s at configured per-tenant limit.

Terraform

3) AI Cost Controls (exists)

Files: infrastructure/terraform/modules/ai-cost-controls/*

Action: Set budget ceilings for LLM/autonomy jobs (you already have the module). Wire budgets to CI.

Accept/Fail Criteria

✅ Budgets/alerts fire in a small dry-run project.

QUALITY (tests & tooling)

Goal (BYO): Prove secrets aren’t stored, deadlines are honored, and transparency/canary/drift features work.

What to add/update

1) “No secrets stored” e2e

Files:

quality/e2e/website/… (add test)

quality/integration/end_to_end_test.go (add case)

Add test: Create/update credentials mapping and then query backend DB/mock store to assert no fields named /(key|secret|token)/ exist.

2) Auction deadline & partial aggregation

Files: quality/load-tests/auction-load-test.js

Add: A scenario where one adapter stalls > timeout. Assert p99 auction <= deadline and decisions made with partial results.

3) Transparency replay

Files: quality/e2e/website/…

Add: Click “Replay” and assert result hash equals original.

4) Fraud drift smoke

Files: quality/load-tests/fraud-smoke-test.js

Add: A run that pushes two synthetic distributions and checks drift_js_divergence rises above threshold, then returns to normal.

5) Lighthouse / a11y budgets unchanged (already present)

Keep lighthouse/website.config.cjs thresholds.

FRAUD (model registry alignment)

You shared a Model Registry spec. In BYO:

Wire now: Fraud Detection (shadow mode) only.

Defer until MD: CTR Prediction & Bid Optimization (helpful, but not required for BYO; publishers’ networks optimize bids).

Immediate wiring:

Ensure the fraud ONNX is loaded by both services only if model_name=="fraud" and tenant allow-listed.

Store metadata.json with calibration & thresholds, but enforce thresholds = “shadow only” until the console flips per-tenant override.

Pinpoint change

File: services/fraud-inference/requirements.txt

Ensure onnxruntime, prometheus-client, pydantic, fastapi, uvicorn, numpy pinned.

File: services/inference-ml/README.md

Document BYO model allow-list + receipts.

HOW THE WHOLE FITS (flow)

SDK (BYO) sends request → Auction Service (multi-tenant).

Auction calls inference-ml (CTR heuristics if enabled) and fraud-inference (shadow score).

Both tag metrics by tenant and return a transparency receipt.

Auction selects winner (no shared network creds), returns creative or mediation instruction.

Console renders:

Transparency hash, Replay button, Fraud shadow charts.

Credentials page stores IDs only, no secrets.

Payouts page: BYO copy + reconciliation export.

Infra enforces probes, rate-limits, JWT roles, and canary.

Quality proves no secrets, deadlines, receipts, and fraud drift alerts work.

Quick index of recommended edits

services/inference-ml/main.py

TENANT_HEADER, withTenant() enforcement in handlers.

make_transparency_receipt() helper; include receipt in responses.

/v1/replay/auction endpoint (deterministic replay).

ALLOWED_MODELS allow-list env.

services/fraud-inference/main.py

Add consent fields to request schema; tenant header required.

FRAUD_MODE default “shadow”; FRAUD_MODE_OVERRIDES_JSON to promote per tenant.

Per-tenant histograms & drift metrics.

console/src/lib/auctionApi.ts

Inject "X-Publisher-Id" from active org context in all calls.

console/src/app//settings/credentials/page.tsx**

Replace secrets UI with IDs/placements only + Verify buttons.

console/src/app//transparency/auctions/**

Show transparency_hash/sig; add “Replay” control.

console/src/app//fraud/**

Shadow-mode banner, score histograms, drift trend, promotion suggestion.

infrastructure/helm/ (backend, fraud-inference, console)

Add envs & probes; set resource requests/limits; canary config; rate-limit.

quality/

Add no-secrets e2e; deadline/partial load test; replay e2e; drift smoke.