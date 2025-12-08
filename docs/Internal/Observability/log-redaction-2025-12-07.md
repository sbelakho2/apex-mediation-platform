# Log Redaction Matrix — 2025-12-07

| Field                         | Scope                              | Action     | Notes |
|-------------------------------|------------------------------------|------------|-------|
| `user_id`                     | Backend request/response logs      | hash(SHA256 salt) | Salt is `OBS_LOG_SALT`, rotated monthly. |
| `device_id` / `idfa` / `gaid` | SDK telemetry, adapters            | drop       | Device identifiers never leave client logs when not strictly required; ATT gating already prevents collection unless authorized. |
| `ip_address`                  | Backend ingress proxy              | truncate /24 | Keep network block only for abuse-triage. |
| `placement_id`               | SDK + backend telemetry            | retain     | Considered non-PII; required for debugging auctions. |
| `auction_root`               | Backend auction logs               | retain     | Already random hash; not user derived. |
| `bid_payload`                | Network adapter telemetry          | hash       | Hash entire payload before storage. |
| `consent_strings`            | Adapter metadata                   | drop       | Use boolean summaries instead (gdpr=1, ccpa=0). |
| `url` (navigations)          | SDK navigation logs                | truncate query | Retain origin + path, strip query params. |
| `email`                      | Console audit logs                 | hash + last2 | Show last 2 chars to differentiate. |

Sample sanitized log line:
```
{"ts":"2025-12-07T20:14:11Z","event":"auction","placement_id":"83d155c1-d3ab-413a-8d6f-bb282d4a058b","user_id_hash":"c1a8...f9","ip_block":"203.0.113.0/24","bid_payload_hash":"1f5b...2c","consent":{"gdpr":1,"ccpa":0,"coppa":0}}
```
