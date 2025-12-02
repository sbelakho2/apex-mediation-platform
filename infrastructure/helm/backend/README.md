# Backend Helm Chart

This chart deploys the ApexMediation backend API with blue/green deployments, HPA, and optional ServiceMonitor + NetworkPolicy resources.

## Prerequisites

| Capability | Requirement |
| --- | --- |
| Kubernetes | v1.25+ cluster with metrics-server installed for HPA support. |
| Secrets | `backend-secrets` (or the name supplied via `secrets.name`) containing `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, and `JWT_REFRESH_SECRET`. The chart mounts this secret automatically when `secrets.mount=true`. |
| ServiceMonitor | Prometheus Operator CRDs (`monitoring.coreos.com/v1`) must exist in the target cluster before enabling `serviceMonitor.enabled`. Point `serviceMonitor.labels`/`namespace` at the operator’s namespace if it differs from the release namespace. |
| NetworkPolicy | A CNI plugin that honors Kubernetes NetworkPolicy (Calico, Cilium, etc.). Enabling `networkPolicy.enabled` without a compatible CNI has no effect. |

## Image Tagging

`values.yaml` defaults `image.tag` to empty so Helm falls back to the chart `appVersion`. Override this value explicitly when promoting canary builds.

## Secrets & Env Sources

Set `secrets.create=false` when referencing an existing secret or provide `secrets.data` for chart-managed clusters. Additional config sources can still be appended via `envFrom` in `values.yaml`.

## Service Monitor

When `serviceMonitor.enabled=true`, ensure Prometheus has permissions to scrape the backend namespace or set `serviceMonitor.namespace` accordingly. Update `serviceMonitor.path`/`port` if the metrics endpoint differs from `/metrics` on `:3001`.

## Network Policy

Network policies default to allowing traffic from the ingress-nginx namespace and egress to PostgreSQL and Redis. Adjust `networkPolicy.ingress`/`networkPolicy.egress` blocks to match your deployment topology.
