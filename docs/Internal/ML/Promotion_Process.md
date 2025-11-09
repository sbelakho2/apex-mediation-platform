# Fraud Model Promotion Process

_Date:_ 2025-11-09  
_Owner:_ Platform Engineering (Fraud & Risk)

## Overview
The promotion process ensures models remain in shadow mode until quantitative guardrails are satisfied and human reviewers sign off. Automation assists with report generation, but a planner-triggered PR is mandatory before any production change.

## Roles
- **Planner bot**: Creates weekly promotion proposals when gating rules pass.
- **Fraud ML engineer**: Validates metrics, drift, and instrumentation.
- **Production safety approver**: Final approval responsible for rollout scheduling.

## Workflow
1. **Nightly Pipeline Output**
   - `ML/scripts/nightly_pipeline.py` runs (or planner-triggered job) producing:
     - `evaluation_metrics.json`
     - Markdown report under `docs/Internal/ML/Reports/`
     - `models/fraud/monitoring/shadow_monitor_latest.json`
     - Packaged model under `models/fraud/<version>/`
2. **Planner PR Creation**
   - Planner opens PR updated with:
     - Proposed threshold (`trained_fraud_model.json` → `recommended_threshold`)
     - Evidence links (evaluation markdown, monitoring JSON, feature manifest hash)
     - Checklist of gating requirements (auto-populated from evaluation payload)
   - PR references `docs/Internal/ML/Threshold_Playbook.md` for manual reviewer checklist.
3. **Reviewer Checklist**
   - Confirm gating decision is `candidate_review` or `promote` in evaluation payload.
   - Confirm drift alert is false and PSI/JS thresholds satisfied.
   - Validate weak-label and post-hoc correlations remain positive.
   - Ensure shadow ClickHouse sink is healthy (no missing days) and monitors exist.
4. **Approval & Rollout**
   - Both Fraud ML engineer and Production safety approver must approve.
   - Upon merge, deployment automation updates ClickHouse shadow gating and schedules gradual rollout.
   - Rollout uses staged thresholds (10% → 50% → 100%) over four weeks with weekly monitoring sign-off.
5. **Rollback Plan**
   - `nightly_pipeline.py --skip-if-unchanged` enables immediate reversion to last stable artifact.
   - Shadow scoring remains active; blocking gate can be toggled off via config flag if issues arise.

## Audit Trail
- All promotion PRs link to evaluation reports and monitoring summaries stored in Git.
- Planner writes status entries into `docs/Internal/Development/DEVELOPMENT_TODO_CHECKLIST.md` upon completion.
- Weekly retrospective reviews ensure acceptance criteria remain satisfied.
