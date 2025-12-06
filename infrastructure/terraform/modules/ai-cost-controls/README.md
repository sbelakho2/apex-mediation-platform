# AI Cost Controls Terraform Module - Usage Example

This example demonstrates how to use the `ai-cost-controls` Terraform module to codify OpenAI budget limits, feature flags, and monitoring infrastructure.

## Prerequisites

- Terraform >= 1.5
- Kubernetes cluster configured (EKS, GKE, or AKS)
- `kubectl` access to production namespace
- OpenAI API key stored in secrets manager

## Module Structure

```
infrastructure/terraform/modules/ai-cost-controls/
├── main.tf          # Main module resources
├── README.md        # This file
├── variables.tf     # Input variables (optional, defined in main.tf)
└── outputs.tf       # Output values (optional, defined in main.tf)
```

## Basic Usage

```hcl
module "ai_cost_controls" {
  source = "./modules/ai-cost-controls"

  namespace            = "production"
  openai_api_key       = data.aws_secretsmanager_secret_version.openai_key.secret_string
  monthly_budget_dollars = 100
  
  # Feature flags (Week 1: Sales only)
  enable_ai_automation           = false
  enable_sales_ai_optimization   = true
  enable_growth_ai_analytics     = false
  enable_self_evolving_ai        = false
  
  # Alerting
  alert_email       = "contact@apexmediation.ee"
  slack_webhook_url = data.aws_secretsmanager_secret_version.slack_webhook.secret_string
}
```

## Staged Rollout Example

### Week 1: Sales Automation Only
```hcl
module "ai_cost_controls" {
  source = "./modules/ai-cost-controls"

  namespace              = "production"
  openai_api_key         = var.openai_api_key
  monthly_budget_dollars = 100
  
  enable_ai_automation           = false  # Keep master switch off
  enable_sales_ai_optimization   = true   # ✅ Enable Week 1
  enable_growth_ai_analytics     = false
  enable_self_evolving_ai        = false
  
  alert_email       = "contact@apexmediation.ee"
  slack_webhook_url = var.slack_webhook_url
}
```

**Expected Spend:** $2.77/month at 100 customers

### Week 2: Add Growth Analytics
```hcl
module "ai_cost_controls" {
  source = "./modules/ai-cost-controls"

  namespace              = "production"
  openai_api_key         = var.openai_api_key
  monthly_budget_dollars = 100
  
  enable_ai_automation           = false
  enable_sales_ai_optimization   = true
  enable_growth_ai_analytics     = true   # ✅ Enable Week 2
  enable_self_evolving_ai        = false
  
  alert_email       = "contact@apexmediation.ee"
  slack_webhook_url = var.slack_webhook_url
}
```

**Expected Spend:** $5.54/month at 100 customers

### Week 3: Full Rollout
```hcl
module "ai_cost_controls" {
  source = "./modules/ai-cost-controls"

  namespace              = "production"
  openai_api_key         = var.openai_api_key
  monthly_budget_dollars = 100
  
  enable_ai_automation           = false
  enable_sales_ai_optimization   = true
  enable_growth_ai_analytics     = true
  enable_self_evolving_ai        = true   # ✅ Enable Week 3
  
  alert_email       = "contact@apexmediation.ee"
  slack_webhook_url = var.slack_webhook_url
}
```

**Expected Spend:** $8.31/month at 100 customers

## Integration with Backend Services

The module creates Kubernetes secrets that your backend services should mount:

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend-api
  namespace: production
spec:
  template:
    metadata:
      labels:
        ai-enabled: "true"  # Required for NetworkPolicy
    spec:
      containers:
      - name: backend
        image: apexmediation/backend:latest
        env:
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: openai-credentials
              key: OPENAI_API_KEY
        - name: ENABLE_AI_AUTOMATION
          valueFrom:
            secretKeyRef:
              name: ai-feature-flags
              key: ENABLE_AI_AUTOMATION
        - name: ENABLE_SALES_AI_OPTIMIZATION
          valueFrom:
            secretKeyRef:
              name: ai-feature-flags
              key: ENABLE_SALES_AI_OPTIMIZATION
        - name: ENABLE_GROWTH_AI_ANALYTICS
          valueFrom:
            secretKeyRef:
              name: ai-feature-flags
              key: ENABLE_GROWTH_AI_ANALYTICS
        - name: ENABLE_SELF_EVOLVING_AI
          valueFrom:
            secretKeyRef:
              name: ai-feature-flags
              key: ENABLE_SELF_EVOLVING_AI
        - name: MONTHLY_BUDGET_DOLLARS
          valueFrom:
            configMapKeyRef:
              name: ai-cost-config
              key: MONTHLY_BUDGET_DOLLARS
```

## Outputs

The module exposes the following outputs:

```hcl
output "openai_secret_name" {
  description = "Name of the Kubernetes secret containing OpenAI API key"
  value       = module.ai_cost_controls.openai_secret_name
}

output "feature_flags_secret_name" {
  description = "Name of the Kubernetes secret containing AI feature flags"
  value       = module.ai_cost_controls.feature_flags_secret_name
}

output "rollout_stage" {
  description = "Current AI rollout stage"
  value       = module.ai_cost_controls.rollout_stage
  # Possible values: "all-disabled", "week-1-sales-only", "week-2-growth-enabled", "week-3-complete"
}
```

## Applying Changes

### Initial Deployment (All AI Disabled)
```bash
cd infrastructure/terraform/production
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

### Week 1 Rollout
```bash
# Update main.tf to enable sales AI
terraform plan -out=tfplan
terraform apply tfplan

# Verify feature flags
kubectl get secret ai-feature-flags -n production -o jsonpath='{.data.ENABLE_SALES_AI_OPTIMIZATION}' | base64 -d
# Expected: true

# Restart backend to pick up new flags
kubectl rollout restart deployment/backend-api -n production
```

### Week 2 Rollout
```bash
# Update main.tf to enable growth AI
terraform plan -out=tfplan
terraform apply tfplan

kubectl rollout restart deployment/backend-api -n production
```

### Week 3 Rollout
```bash
# Update main.tf to enable self-evolving AI
terraform plan -out=tfplan
terraform apply tfplan

kubectl rollout restart deployment/backend-api -n production
```

## Emergency Rollback

If AI spend exceeds budget or causes issues:

```bash
# Option 1: Disable all AI features via Terraform
terraform apply -var="enable_sales_ai_optimization=false" \
                -var="enable_growth_ai_analytics=false" \
                -var="enable_self_evolving_ai=false"

kubectl rollout restart deployment/backend-api -n production

# Option 2: Manual hotfix (immediate)
kubectl patch secret ai-feature-flags -n production \
  --type='json' \
  -p='[{"op": "replace", "path": "/data/ENABLE_SALES_AI_OPTIMIZATION", "value":"ZmFsc2U="}]'
  # ZmFsc2U= is base64("false")

kubectl rollout restart deployment/backend-api -n production
```

## Monitoring Integration

The module configures resources that integrate with Prometheus alerts defined in `monitoring/alerts.yml`:

1. **OpenAISpendExceeds50Percent** - Warning when 50% of budget consumed
2. **OpenAISpendExceeds80Percent** - Critical when 80% of budget consumed
3. **OpenAIHardLimitReached** - Critical when 100% of budget consumed
4. **UnexpectedAISpendSpike** - Warning on sudden spend increases

Ensure Prometheus is scraping the `openai_monthly_spend_dollars` metric from your backend services.

## Cost Estimation

| Customer Count | Monthly Spend |
|---------------|---------------|
| 100           | $8.31         |
| 500           | $41.55        |
| 1,000         | $83.10        |
| 10,000        | $831.00       |

**Per-Service Breakdown (at 100 customers):**
- Sales AI Optimization: $2.77/month
- Growth AI Analytics: $2.77/month
- Self-Evolving AI: $2.77/month

## Compliance & Auditing

All changes to AI feature flags are:
1. **Version Controlled:** Tracked in Terraform state
2. **Auditable:** Kubernetes annotations include `last-updated` timestamp
3. **Reversible:** Full rollback capability via Terraform
4. **Documented:** Runbook at `../../runbooks/AI_COST_CONTROLS.md`

## Troubleshooting

### Feature flags not updating
```bash
# Check secret contents
kubectl get secret ai-feature-flags -n production -o yaml

# Check if pods have restarted
kubectl get pods -n production -o wide

# Force restart
kubectl rollout restart deployment/backend-api -n production
```

### Daily cost review job failing
```bash
# Check CronJob status
kubectl get cronjobs -n production

# View recent job logs
kubectl logs -n production job/ai-cost-daily-review-<timestamp>

# Test Slack webhook manually
curl -X POST $SLACK_WEBHOOK_URL -H 'Content-Type: application/json' -d '{"text":"Test alert"}'
```

### Budget limits not enforced
```bash
# Verify OpenAI dashboard limits
# 1. Log in to https://platform.openai.com/usage
# 2. Check Settings > Limits
# 3. Ensure soft limit (50%) and hard limit (100%) are configured

# Check Prometheus alerts
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# Navigate to http://localhost:9090/alerts and search for "OpenAI"
```

## References

- **Full Runbook:** `../../runbooks/AI_COST_CONTROLS.md`
- **Prometheus Alerts:** `monitoring/alerts.yml` (ai_cost_controls group)
- **Backend Implementation:** `backend/services/sales/InfluenceBasedSalesService.ts`
- **Deployment Guide:** `docs/production-deployment.md` (Step 5.5)
- **Pre-Deployment Checklist:** `PRE_DEPLOYMENT_CHECKLIST.md` (Section 4)

## Support

For issues with AI cost controls:
- **Platform Team:** contact@apexmediation.ee
- **On-Call:** PagerDuty escalation
- **Emergency Rollback:** See "Emergency Rollback" section above
