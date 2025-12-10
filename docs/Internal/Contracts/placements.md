### Placement schema and configuration — backend v1 mapping

This document maps the current backend data model and HTTP contracts for placements and proposes a compact, forward‑compatible v1 configuration schema for targeting, delivery, pricing, and SDK ad unit identifiers.

#### Current backend (as of 2025‑11‑19)

- Table `placements` (backend/migrations/001_initial_schema.sql):
  - `id UUID PK`
  - `app_id UUID NOT NULL REFERENCES apps(id)`
  - `name TEXT NOT NULL`
  - `type TEXT NOT NULL`  — UI corresponds to Banner/Interstitial/Rewarded/Native
  - `status TEXT NOT NULL DEFAULT 'active'`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

- HTTP routes (backend/src/routes/placement.routes.ts):
  - `GET   /api/v1/placements` — list (mocked)
  - `GET   /api/v1/placements/:id` — detail (mocked)
  - `POST  /api/v1/placements` — create
  - `PUT   /api/v1/placements/:id` — update (partial; see Zod schema)
  - `DELETE /api/v1/placements/:id` — delete

- Validation (backend/src/controllers/placement.controller.ts):
  - Create: `{ name: string; type: 'banner'|'interstitial'|'rewarded'|'native'; appId: string; platform: 'ios'|'android'|'unity'|'web' }`
  - Update: `{ name?: string; status?: 'active'|'paused' }`
  - Notes: Zod does not declare additional config fields. Unknown keys are ignored by parse (i.e., they are not returned; the controller responds with `{ id, ...data }`).

Currently, there is no dedicated placement configuration persisted for targeting, frequency caps, floors, or platform‑specific ad unit identifiers.

#### Proposed Placement Config v1

Introduce a configuration object to support common placement controls while aligning with existing code conventions (Express + Zod; camelCase JSON; money as integer cents in storage; currencies as ISO‑4217 strings).

- Storage: Add a JSONB column `config` to `placements`, or a separate table `placement_configs (placement_id PK, config JSONB, updated_at, updated_by)`.
  - Migration example:
    - `ALTER TABLE placements ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;`
  - Alternatively, create a new table if stronger auditing or versioning is desired.

- JSON schema (canonical types):
  ```json
  {
    "targeting": {
      "geos": ["US", "CA"],
      "platforms": ["ios", "android", "unity", "web"],
      "osVersions": { "ios": ">=13.0", "android": ">=8" },
      "appVersions": ["1.2.0", "1.3.*"]
    },
    "delivery": {
      "frequencyCap": { "count": 3, "per": "day" },
      "pacing": { "impressionsPerMinute": 0 }
    },
    "pricing": {
      "floorPriceCents": 50,
      "currency": "USD"
    },
    "sdk": {
      "unitIdIos": "com.app.ios.banner.home",
      "unitIdAndroid": "com.app.android.banner.home",
      "unitIdUnity": "zone-or-placement-id",
      "unitIdWeb": "placement-key"
    },
    "metadata": {
      "labels": ["homepage", "experiment-A"],
      "notes": "Optional operator notes"
    }
  }
  ```

- HTTP contracts (additive):
  - `GET    /api/v1/placements/:id` → include `config` in the response payload
  - `PATCH  /api/v1/placements/:id` → accept partial update that may include `config` or nested paths (e.g., `config.pricing.floorPriceCents`)
  - `PUT    /api/v1/placements/:id/config` (optional) → upsert full config document

- Zod validation sketch:
  ```ts
  const iso2 = z.string().regex(/^[A-Z]{2}$/);
  const platforms = z.enum(['ios', 'android', 'unity', 'web']);
  const configSchema = z.object({
    targeting: z.object({
      geos: z.array(iso2).max(300).optional(),
      platforms: z.array(platforms).min(1).max(4).optional(),
      osVersions: z.record(z.string().min(1)).optional(),
      appVersions: z.array(z.string().min(1)).max(50).optional(),
    }).partial().optional(),
    delivery: z.object({
      frequencyCap: z.object({ count: z.number().int().min(0).max(1000), per: z.enum(['minute','hour','day']) }).optional(),
      pacing: z.object({ impressionsPerMinute: z.number().int().min(0).max(1_000_000) }).optional(),
    }).partial().optional(),
    pricing: z.object({
      floorPriceCents: z.number().int().min(0).max(10_000_00),
      currency: z.string().regex(/^[A-Z]{3}$/),
    }).partial().optional(),
    sdk: z.object({
      unitIdIos: z.string().max(200).optional(),
      unitIdAndroid: z.string().max(200).optional(),
      unitIdUnity: z.string().max(200).optional(),
      unitIdWeb: z.string().max(200).optional(),
    }).partial().optional(),
    metadata: z.object({
      labels: z.array(z.string().min(1).max(50)).max(50).optional(),
      notes: z.string().max(2000).optional(),
    }).partial().optional(),
  }).strict();
  ```

#### UI mapping alignment (website)

The website placements modal currently exposes simplified fields that can map to the proposed config schema:

- Targeting tab:
  - `geos` → `config.targeting.geos` (normalized to uppercase ISO‑2 array)
  - `platforms` (labelled single selection in UI) → map to an array on save
  - `frequencyCap` → `config.delivery.frequencyCap.count` with `per = 'day'` by default
  - `floorPriceUsd` (UI majors) → convert to `config.pricing.floorPriceCents`

- Ad Units tab:
  - `unitIdIos` → `config.sdk.unitIdIos`
  - `unitIdAndroid` → `config.sdk.unitIdAndroid`

Until the backend adds `config`, the UI should continue to optimistically update local state while the server ignores unknown keys (current behavior).

#### Next steps (backend)

1) Decide storage approach (inline JSONB column vs separate table). JSONB column keeps it simple.
2) Add migration for `config` + update controller:
   - Include `config` on GET
   - Accept `PATCH /placements/:id` with partial config (preferred over PUT for partial updates)
   - Validate with `configSchema`
3) Update OpenAPI (`backend/openapi.yaml`) to document the new fields and response shapes.

#### Error handling and constraints

- Money values are integer cents in storage; UI converts majors↔cents.
- Country codes must be ISO‑3166‑1 alpha‑2 uppercase (e.g., "US").
- Platform values limited to `ios|android|unity|web`.
- Frequency cap count must be ≥0; a value of 0 disables the cap.
- Labels max 50 entries; each max 50 chars.

This schema provides a pragmatic baseline that supports common publisher needs without blocking future extension (e.g., per‑geo floors, auction rules, partner allow/deny lists).
