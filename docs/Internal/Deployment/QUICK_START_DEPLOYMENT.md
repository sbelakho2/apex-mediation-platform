# 🚀 Quick Start: Production Deployment

**ApexMediation Platform - Deployment Quick Reference**  
Use this guide for rapid deployment execution after completing all checklists.

---

## ⚡ Pre-Flight Checklist (5 minutes)

```bash
# 1. Validate deployment readiness
cd /Users/sabelakhoua/Ad\ Project
./scripts/validate-deployment.sh

# 2. Verify build
cd backend && npm run build

# 3. Check environment variables
grep -E "ENABLE_|OPENAI_API_KEY" backend/.env

# Expected output:
# OPENAI_API_KEY=sk-proj-...
# ENABLE_AI_AUTOMATION=false
# ENABLE_SALES_AI_OPTIMIZATION=false
# ENABLE_GROWTH_AI_ANALYTICS=false
# ENABLE_SELF_EVOLVING_AI=false
```

**✅ All checks pass?** → Continue to deployment  
**❌ Any failures?** → Review `PRE_DEPLOYMENT_CHECKLIST.md`

---

## 📋 Required Documents

Before deploying, ensure you have reviewed:

| Priority | Document | Purpose |
|----------|----------|---------|
| **CRITICAL** | `PRE_DEPLOYMENT_CHECKLIST.md` | 100+ validation items (10 sections) |
| **CRITICAL** | `DEPLOYMENT_READINESS_SUMMARY.md` | Executive readiness overview |
| **CRITICAL** | `infrastructure/runbooks/AI_COST_CONTROLS.md` | AI cost management procedures |
| High | `docs/production-deployment.md` | Full 12-step deployment guide |
| High | `DEPLOYMENT_COMPLETION_REPORT.md` | Completion status and validation results |

---

## 🎯 Deployment Steps (15 minutes)

### Step 1: Apply Terraform AI Cost Controls (3 min)
```bash
cd infrastructure/terraform/production

# Initialize Terraform
terraform init

# Plan changes
terraform plan \
  -var="monthly_budget_dollars=100" \
  -var="enable_ai_automation=false" \
  -var="enable_sales_ai_optimization=false" \
  -var="enable_growth_ai_analytics=false" \
  -var="enable_self_evolving_ai=false" \
  -out=tfplan

# Apply changes
terraform apply tfplan
```

**Verify:**
```bash
kubectl get secret openai-credentials -n production -o jsonpath='{.data.OPENAI_API_KEY}' | base64 -d
# Should output: sk-proj-...

kubectl get secret ai-feature-flags -n production -o jsonpath='{.data}' | jq
# Should show all flags as "false"
```

### Step 2: Deploy Kubernetes Resources (5 min)
```bash
# Create namespace
kubectl create namespace production
kubectl label namespace production istio-injection=enabled

# Deploy all services
kubectl apply -f infrastructure/k8s/production/

# Verify deployments
kubectl get pods -n production
kubectl get services -n production
kubectl get cronjobs -n production

# Expected output:
# backend-api: 3/3 Running
# console: 2/2 Running
# ai-cost-daily-review: CronJob created
```

### Step 3: Apply Database Migrations (3 min)
```bash
# Connect to backend pod
kubectl exec -it deployment/backend-api -n production -- /bin/bash

# Run migrations
npm run migrate

# Verify migrations
psql $DATABASE_URL -c "SELECT * FROM schema_migrations ORDER BY version;"
# Expected: 14 rows (001 through 014)

exit
```

### Step 4: Health Checks (2 min)
```bash
# Check API health
kubectl port-forward -n production svc/backend-api 8080:8080 &
curl http://localhost:8080/health
# Expected: {"status":"healthy"}

# Check logs
kubectl logs -n production deployment/backend-api --tail=50
# Expected: No errors, "Server listening on port 8080"

# Stop port-forward
pkill -f "port-forward"
```

### Step 5: DNS Cutover (2 min)
```bash
# Get load balancer IP
kubectl get svc -n production backend-api -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

# Update DNS records (in your DNS provider):
# api.apexmediation.com → <LOAD_BALANCER_IP>
# console.apexmediation.com → <LOAD_BALANCER_IP>

# Wait for DNS propagation (1-5 minutes)
watch -n 5 dig api.apexmediation.com +short
```

---

## 🎭 Post-Deployment Monitoring (First Hour)

### Dashboard URLs
```bash
# Grafana (monitoring)
kubectl port-forward -n monitoring svc/grafana 3000:3000
# Open: http://localhost:3000

# Prometheus (alerts)
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# Open: http://localhost:9090/alerts

# API Health
curl https://api.apexmediation.com/health
```

### Critical Metrics to Watch
```bash
# Error rate (should be < 1%)
kubectl top pods -n production

# Database connections
kubectl exec -it deployment/backend-api -n production -- \
  psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# AI spend (should be $0.00 initially)
kubectl logs -n production cronjob/ai-cost-daily-review --tail=10
```

### Common Issues & Fixes

**Issue:** Pods not starting
```bash
kubectl describe pod -n production <pod-name>
kubectl logs -n production <pod-name>
```

**Issue:** Database connection errors
```bash
kubectl get secret backend-secrets -n production -o jsonpath='{.data.DATABASE_URL}' | base64 -d
# Verify connection string format
```

**Issue:** Health check failing
```bash
kubectl exec -it deployment/backend-api -n production -- curl http://localhost:8080/health
```

---

## 🔄 Staged AI Rollout (Week 1-3)

### Week 1: Sales AI Only
```bash
# Update Terraform
cd infrastructure/terraform/production
terraform apply \
  -var="enable_sales_ai_optimization=true" \
  -var="enable_growth_ai_analytics=false" \
  -var="enable_self_evolving_ai=false"

# Restart pods to pick up new flags
kubectl rollout restart deployment/backend-api -n production

# Verify feature flag
kubectl exec -it deployment/backend-api -n production -- env | grep ENABLE_SALES
# Expected: ENABLE_SALES_AI_OPTIMIZATION=true

# Monitor spend daily
# Expected: $2.77/month at 100 customers
```

### Week 2: Add Growth AI
```bash
terraform apply \
  -var="enable_sales_ai_optimization=true" \
  -var="enable_growth_ai_analytics=true" \
  -var="enable_self_evolving_ai=false"

kubectl rollout restart deployment/backend-api -n production

# Expected spend: $5.54/month at 100 customers
```

### Week 3: Full AI Rollout
```bash
terraform apply \
  -var="enable_sales_ai_optimization=true" \
  -var="enable_growth_ai_analytics=true" \
  -var="enable_self_evolving_ai=true"

kubectl rollout restart deployment/backend-api -n production

# Expected spend: $8.31/month at 100 customers
```

---

## 🚨 Emergency Rollback

### Option 1: Disable AI via Terraform (2 minutes)
```bash
cd infrastructure/terraform/production
terraform apply \
  -var="enable_sales_ai_optimization=false" \
  -var="enable_growth_ai_analytics=false" \
  -var="enable_self_evolving_ai=false"

kubectl rollout restart deployment/backend-api -n production
```

### Option 2: Manual Hotfix (30 seconds)
```bash
# Disable all AI features immediately
kubectl patch secret ai-feature-flags -n production --type='json' -p='[
  {"op":"replace","path":"/data/ENABLE_SALES_AI_OPTIMIZATION","value":"ZmFsc2U="},
  {"op":"replace","path":"/data/ENABLE_GROWTH_AI_ANALYTICS","value":"ZmFsc2U="},
  {"op":"replace","path":"/data/ENABLE_SELF_EVOLVING_AI","value":"ZmFsc2U="}
]'

kubectl rollout restart deployment/backend-api -n production
```

### Option 3: Full Deployment Rollback
```bash
# Rollback to previous version
kubectl rollout undo deployment/backend-api -n production

# Check rollout status
kubectl rollout status deployment/backend-api -n production
```

---

## 📊 Daily Operations

### Morning Routine (5 minutes)
```bash
# 1. Check AI spend
kubectl logs -n production cronjob/ai-cost-daily-review --tail=20

# 2. Review alerts
kubectl get alerts -n monitoring | grep -i openai

# 3. Check error rates
kubectl top pods -n production

# 4. Verify backups
kubectl get cronjobs -n production
```

### Weekly Review (30 minutes)
- Review `PRE_DEPLOYMENT_CHECKLIST.md` Section 4 (AI Cost Controls)
- Compare actual vs estimated spend
- Adjust feature flags if needed
- Report to finance

---

## 📞 Emergency Contacts

| Scenario | Contact |
|----------|---------|
| Production down | PagerDuty (auto-escalates) |
| AI spend spike | platform@apexmediation.com + finance@apexmediation.com |
| Security incident | security@apexmediation.com |
| Database issues | dba@apexmediation.com |
| General support | #platform-alerts (Slack) |

---

## 📚 Reference Links

- **Full Deployment Guide:** `docs/production-deployment.md`
- **Pre-Deployment Checklist:** `PRE_DEPLOYMENT_CHECKLIST.md`
- **AI Cost Controls:** `infrastructure/runbooks/AI_COST_CONTROLS.md`
- **Terraform Module:** `infrastructure/terraform/modules/ai-cost-controls/README.md`
- **Completion Report:** `DEPLOYMENT_COMPLETION_REPORT.md`

---

**Last Updated:** 2025-11-04  
**Version:** 1.0  
**Maintained by:** Platform Engineering Team
