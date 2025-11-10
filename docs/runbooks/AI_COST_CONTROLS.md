# AI Automation Cost Control Runbook

**Last Updated:** 2025-11-04  
**Owner:** Platform Engineering & Finance  
**Purpose:** Codify spend limits and alert configuration for OpenAI usage in production

---

## Overview

ApexMediation uses OpenAI GPT-4o-mini for AI-powered automation across three services:
1. **Sales Automation** (`ENABLE_SALES_AI_OPTIMIZATION`)
2. **Growth Analytics** (`ENABLE_GROWTH_AI_ANALYTICS`)
3. **Self-Evolving System** (`ENABLE_SELF_EVOLVING_AI`)

**Default Policy:** All AI flags are `false` in dev/staging. Production must opt in with finance approval.

---

## Pre-Production Checklist

### 1. Configure OpenAI Usage Alerts

**Location:** [OpenAI Dashboard → Settings → Usage limits](https://platform.openai.com/account/billing/limits)

**Required Configuration:**
```yaml
Soft Limit (Warning):
  - Threshold: 50% of approved monthly budget
  - Action: Email to platform-team@company.com + finance@company.com
  - Frequency: Daily digest

Hard Limit (Block):
  - Threshold: 100% of approved monthly budget
  - Action: API requests blocked + immediate Slack alert
  - Frequency: Instant notification
```

**Monthly Budget Approval Process:**
1. Submit budget request with projected usage breakdown by service
2. Finance approves monthly allocation (e.g., $500/month)
3. Set OpenAI soft limit = $250, hard limit = $500
4. Document approval in deployment change log

### 2. Environment Variable Configuration

**Development/Staging (Default):**
```bash
OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
ENABLE_AI_AUTOMATION=false
ENABLE_SALES_AI_OPTIMIZATION=false
ENABLE_GROWTH_AI_ANALYTICS=false
ENABLE_SELF_EVOLVING_AI=false
```

**Production (Opt-In After Approval):**
```bash
OPENAI_API_KEY=sk-proj-YOUR_PRODUCTION_KEY
ENABLE_AI_AUTOMATION=true              # Master flag
ENABLE_SALES_AI_OPTIMIZATION=true      # Opt-in per service
ENABLE_GROWTH_AI_ANALYTICS=false       # Keep false until needed
ENABLE_SELF_EVOLVING_AI=false          # Keep false until needed
```

### 3. Staged Rollout Protocol

**Step 1: Enable One Service**
- Flip `ENABLE_AI_AUTOMATION=true` + one per-service flag
- Monitor for 24 hours, validate spend < $20/day
- Document in change log: "Enabled sales AI automation on [date]"

**Step 2: Add Second Service**
- Wait 24 hours after Step 1
- Review OpenAI dashboard for actual usage vs. projected
- If within budget, enable second service
- Monitor for 48 hours

**Step 3: Full Rollout**
- After 7 days of stable operation, enable remaining services
- Set calendar reminder for monthly spend review

---

## Monitoring & Alerting

### OpenAI Usage Dashboard

**Access:** https://platform.openai.com/usage

**Daily Checks (Automated):**
- Total tokens used (prompt + completion)
- Cost per service (tag by `user` field in API calls)
- Rate limit warnings

**Weekly Review (Human):**
- Compare actual vs. projected spend
- Identify cost outliers (e.g., one customer triggering excessive AI calls)
- Adjust per-service flags if needed

### Prometheus Alerts

**Add to `monitoring/alerts.yml`:**
```yaml
- name: ai_cost_controls
  interval: 1h
  rules:
    - alert: OpenAISpendExceeds50Percent
      expr: openai_monthly_spend_dollars > openai_budget_dollars * 0.5
      for: 1h
      labels:
        severity: warning
        service: ai_automation
      annotations:
        summary: "OpenAI spend at 50% of monthly budget"
        description: "Current spend: ${{ $value }}, Budget: {{ $labels.budget }}"

    - alert: OpenAISpendExceeds80Percent
      expr: openai_monthly_spend_dollars > openai_budget_dollars * 0.8
      for: 30m
      labels:
        severity: critical
        service: ai_automation
      annotations:
        summary: "OpenAI spend at 80% of monthly budget"
        description: "Review usage immediately. Consider disabling flags."

    - alert: OpenAIHardLimitReached
      expr: openai_requests_blocked_total > 0
      for: 5m
      labels:
        severity: critical
        service: ai_automation
      annotations:
        summary: "OpenAI hard limit reached - requests blocked"
        description: "AI automation is offline. Increase budget or disable flags."
```

### Grafana Dashboard

**Create dashboard:** `AI Automation Cost Tracking`

**Panels:**
1. Monthly spend trend (line chart)
2. Cost breakdown by service (pie chart)
3. Token usage per day (bar chart)
4. Budget utilization percentage (gauge)
5. Requests blocked due to limits (counter)

---

## Emergency Procedures

### Scenario 1: Unexpected Spend Spike

**Symptoms:** OpenAI usage jumps 3x+ overnight

**Response:**
1. Check OpenAI dashboard for which service is responsible
2. Review application logs for unusual AI call patterns
3. Identify customer or feature causing spike
4. **Immediate mitigation:** Disable the relevant flag:
   ```bash
   # Update .env or Kubernetes secret
   ENABLE_SALES_AI_OPTIMIZATION=false
   # Redeploy
   kubectl rollout restart deployment/backend-api -n production
   ```
5. Investigate root cause (bug, abuse, legitimate scale)
6. Re-enable after fix with increased monitoring

### Scenario 2: Budget Exhausted Mid-Month

**Symptoms:** OpenAI hard limit reached, requests blocked

**Response:**
1. **Immediate:** Disable all AI flags to restore service:
   ```bash
   ENABLE_AI_AUTOMATION=false
   kubectl rollout restart deployment/backend-api -n production
   ```
2. Contact finance for emergency budget increase
3. If approved, raise OpenAI limits and re-enable flags
4. If not approved, run without AI until next month
5. Post-incident: Review why usage exceeded projections

### Scenario 3: Rollback Procedure

**When:** Need to disable AI quickly (budget, quality, or performance issues)

**Steps:**
```bash
# 1. Update environment secrets
kubectl edit secret backend-secrets -n production
# Set all ENABLE_* flags to false

# 2. Restart deployment
kubectl rollout restart deployment/backend-api -n production

# 3. Verify flags disabled
kubectl exec -it deployment/backend-api -n production -- env | grep ENABLE

# 4. Confirm AI calls stopped
# Check OpenAI dashboard: requests should drop to zero within 5 minutes

# 5. Document in incident log
echo "[$(date)] AI automation disabled due to [reason]" >> /var/log/deployment-changes.log
```

---

## Cost Optimization Strategies

### 1. Use Cheaper Models When Possible

**Current:** GPT-4o-mini ($0.15/1M input tokens, $0.60/1M output)

**Optimization:**
- For simple classification tasks, consider GPT-3.5-turbo ($0.50/1M vs $0.15/1M)
- For sales automation (high-value), keep GPT-4o-mini
- For self-evolving system (low-priority), test GPT-3.5-turbo

### 2. Reduce Token Usage

**Strategies:**
- Shorten system prompts (remove examples if not critical)
- Use `max_tokens` to cap response length
- Cache common responses (e.g., sales templates)
- Batch API calls instead of one-per-customer

**Example Optimization:**
```typescript
// Before: ~500 tokens per call
const prompt = `[Long system prompt with many examples...]`;

// After: ~200 tokens per call
const prompt = `Analyze metrics. Return JSON: {recommendations: [...]}`;
```

### 3. Implement Client-Side Caching

**Add to services:**
```typescript
// Cache AI responses for 24 hours
const cacheKey = `ai:optimization:${customerId}:${date}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

// Only call OpenAI if cache miss
const result = await openai.chat.completions.create({...});
await redis.setex(cacheKey, 86400, JSON.stringify(result));
```

---

## Audit & Compliance

### Monthly Review Checklist

**First Week of Month:**
- [ ] Export OpenAI usage report (CSV)
- [ ] Compare actual vs. budgeted spend
- [ ] Identify top 5 cost drivers
- [ ] Document any variances > 20%
- [ ] Submit findings to finance

**Quarterly Review:**
- [ ] Assess ROI of AI automation (cost vs. revenue impact)
- [ ] Renegotiate budget if usage pattern changed
- [ ] Update this runbook with lessons learned

### Change Log Template

```
Date: YYYY-MM-DD
Change: [Enabled/Disabled] [Service Name]
Reason: [Budget approved / Cost spike / Testing / etc.]
Approved By: [Finance contact]
Impact: $XX/month projected increase/decrease
Rollback Plan: [Steps to reverse if needed]
```

---

## Contact Information

**Primary Owner:** Platform Engineering  
**Email:** platform-team@company.com  
**Slack:** #platform-engineering

**Finance Approver:** Finance Team  
**Email:** finance@company.com  
**Slack:** #finance

**On-Call Escalation:** PagerDuty > Platform Team  
**Runbook Location:** `/infrastructure/runbooks/AI_COST_CONTROLS.md`

---

## Appendix: Usage Estimation

### Projected Token Usage (GPT-4o-mini)

**Sales Automation (`ENABLE_SALES_AI_OPTIMIZATION`):**
- Runs: 1x/day
- Customers in trial: ~10-50/day
- Tokens per analysis: ~1,000 (500 input + 500 output)
- Daily cost: 50 customers × 1,000 tokens × $0.375/1M = **$0.019/day** = **~$0.57/month**

**Growth Analytics (`ENABLE_GROWTH_AI_ANALYTICS`):**
- Runs: 1x/day
- Active customers: ~100-500/day
- Tokens per insight: ~800
- Daily cost: 500 customers × 800 tokens × $0.375/1M = **$0.15/day** = **~$4.50/month**

**Self-Evolving System (`ENABLE_SELF_EVOLVING_AI`):**
- Runs: 1x/hour
- Optimization checks: ~10/hour
- Tokens per check: ~1,200
- Daily cost: 24 hours × 10 checks × 1,200 tokens × $0.375/1M = **$0.108/day** = **~$3.24/month**

**Total Projected:** ~$8.31/month (at 100 active customers)

**With 500 customers:** ~$41.55/month  
**With 1,000 customers:** ~$83.10/month

**Recommended Budget:** Start with $100/month, increase as customer base grows.
