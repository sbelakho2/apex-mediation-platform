# ApexMediation Documentation Index

**Complete documentation for the ApexMediation platform organized by audience and purpose.**

> **FIX-10 Governance:** Status claims must reference both `docs/Internal/Development/AD_PROJECT_FILE_ANALYSIS.md` (inventory) and `docs/Internal/Development/FIXES.md` (ordered backlog). Deployment readiness is centralized in `docs/Internal/Deployment/PROJECT_STATUS.md`.

> **VERIFY-FIRST:** Any documentation update must first confirm scope against `Dev_Checklist_v1_1_VERIFY_FIRST.md`. Mark the checklist rows as verified _before_ asserting completion inside the docs below.

---

## 📁 Documentation Structure

```
Docs/
├── Customer-Facing/          # Public documentation for customers
│   ├── Getting-Started/      # Onboarding and quick starts
│   ├── API-Reference/        # REST API documentation
│   ├── Billing-Compliance/   # Pricing, payouts, compliance
│   ├── Troubleshooting/      # FAQ and support
│   └── SDK-Integration/      # Unity, iOS, Android SDKs
│
├── Internal/                 # Internal team documentation
│   ├── Development/          # Development guides
│   ├── Deployment/           # Deployment procedures
│   ├── Infrastructure/       # Infrastructure setup
│   ├── Security/             # Security procedures
│   ├── Automation/           # Automation guides
│   └── Sales/                # Sales strategies
│
├── Architecture/             # System architecture docs
└── Runbooks/                 # Operational procedures
```

---

## 🌐 Customer-Facing Documentation

### Getting Started
- `quickstart.md` - 10-minute integration guide
- Account setup and verification
- First ad request examples

### API Reference
- `authentication.md` - JWT and API key authentication
- REST API endpoints (50+ documented)
- Webhooks and callbacks
- Error codes and handling

### Billing & Compliance
- `pricing.md` - Revenue share models (15%, 12%, 10%)
- Payment methods and schedules
- Estonian tax compliance
- GDPR and data processing

### Troubleshooting
- `faq.md` - 40+ frequently asked questions
- Common integration errors
- Performance optimization
- Support channels

### SDK Integration
- Unity SDK (C#)
- iOS SDK (Swift)
- Android SDK (Kotlin)
- Web SDK (JavaScript)

---

## 🔧 Internal Documentation

### Development
- **DEVELOPMENT.md** - Main development guide
  - Environment setup
  - Code structure
  - Best practices

- **VSCODE_GUIDE.md** - VS Code as development home
  - Tasks and shortcuts
  - Debugging configurations
  - Extensions and settings

- **TESTING_GUIDE.md** - Testing strategies
  - Unit testing
  - Integration testing
  - E2E testing

- **ANALYTICS_IMPLEMENTATION.md** - Analytics system
- **SDK_*.md** - SDK implementation details
- **CONSOLE_INTEGRATION_SUMMARY.md** - Console integration

### Deployment
- **DEPLOYMENT_ROADMAP.md** - Deployment strategy
- **DEPLOYMENT_STATUS.md** - Current deployment status
- **DEPLOYMENT_COMPLETION_REPORT.md** - Completion report
- **DEPLOYMENT_READINESS_SUMMARY.md** - Readiness checklist
- **QUICK_START_DEPLOYMENT.md** - Quick deployment guide
- **PRE_DEPLOYMENT_CHECKLIST.md** - Pre-deployment validation
- **PRODUCTION_READINESS_CHECKLIST.md** - Production checklist
- **CI_CD_COMPLETION_REPORT.md** - CI/CD implementation
- **CI_CD_GUIDE.md** - CI/CD setup
- **ACCOUNTING_*.md** - Accounting system docs
- **ESTONIAN_E_SYSTEMS.md** - Estonian e-government integration
- **ROLLOUT_STRATEGY.md** - Rollout and scaling
- **PROJECT_*.md** - Project status reports
- **IMPLEMENTATION_*.md** - Implementation summaries
- **FIRST_CUSTOMER_INTEGRATION_CHECKLIST.md** - First customer onboarding
> **Deployment status canonical:** Use `PROJECT_STATUS.md` for any production-readiness statements. `PROJECT_COMPLETE.md`, `PROJECT_COMPLETION.md`, and `SYSTEM_COMPLETE.md` are archived for historical context only.

### Infrastructure
- **INFRASTRUCTURE_MIGRATION_PLAN.md** - Migration guide
  - Cloud provider migration
  - Database migration
  - Service architecture

- **CLICKHOUSE_INTEGRATION.md** - ClickHouse analytics
  - Schema design
  - Query optimization
  - Real-time analytics

- **observability.md** - Monitoring and observability
  - Prometheus metrics
  - Grafana dashboards
  - Alert configuration

- **production-deployment.md** - Production procedures

### Security
- **SECRETS_POLICY.md** - Secrets management policy
  - Never commit secrets to version control
  - Secret rotation schedules
  - GitHub secret scanning and push protection
  - Incident response procedures
  
- **SECRETS_MANAGEMENT_SETUP.md** - Infisical setup
  - Installation guide
  - Migration procedures
  - Development workflow

- **SECURITY_FIXES_SUMMARY.md** - Security fixes implemented
  - Rate limiting
  - Input validation
  - Fraud detection

- **AUDIT_REPORT.md** - Initial security audit
- **COMPREHENSIVE_AUDIT_REPORT.md** - Complete system audit

### Automation
- **ZERO_TOUCH_AUTOMATION_GUIDE.md** - Zero-touch automation
  - Deployment automation
  - Monitoring automation
  - Incident response automation

- **AUTOMATION_COMPLETE.md** - Automation status
- **BUSINESS_AUTOMATION.md** - Business process automation
- **PLATFORM_UPDATES_AUTOMATION.md** - Platform updates
- **ULTRA_LEAN_AUTOMATION.md** - Ultra-lean operations

### Sales
- **CIALDINI_SALES_STRATEGY.md** - Sales strategy
  - Cialdini's principles of influence
  - Cold outreach templates
  - Conversion optimization

- **SALES_AUTOMATION_SUMMARY.md** - Sales automation overview
- **SALES_AUTOMATION_QUICK_REF.md** - Quick reference
- **SALES_AUTOMATION_OPERATIONS.md** - Operations guide

---

## 🏗️ Architecture Documentation

- **WEBSITE_ARCHITECTURE.md** - Website design system
  - Study in Sweden visual language
  - Component library
  - Responsive breakpoints

- **WEBSITE_TODO.md** - Website implementation tasks
  - Phase 1-9 breakdown
  - 400-hour timeline
  - Resource allocation

- **WEBSITE_DASHBOARD_AUTH_INTEGRATION.md** - Auth flow
  - Shared JWT sessions
  - Cross-domain cookies
  - Seamless navigation

- **enhanced_ad_stack_srs_v2_0.md** - System requirements
  - Complete SRS document
  - Feature specifications
  - Technical requirements

---

## 📚 Runbooks

Operational procedures for production systems:
- Incident response procedures
- Disaster recovery
- Scaling procedures
- Database maintenance
- Security incident handling

---

## 🔍 Quick Navigation

### I'm a Customer/Developer
1. Start with [Getting Started](./Customer-Facing/Getting-Started/)
2. Learn about [Authentication](./Customer-Facing/API-Reference/authentication.md)
3. Understand [Pricing](./Customer-Facing/Billing-Compliance/pricing.md)
4. Check the [FAQ](./Customer-Facing/Troubleshooting/faq.md)

### I'm a Backend Developer
1. Read [DEVELOPMENT.md](./Internal/Development/DEVELOPMENT.md)
2. Set up [VS Code](./Internal/Development/VSCODE_GUIDE.md)
3. Review [Security Setup](./Internal/Security/SECRETS_MANAGEMENT_SETUP.md)
4. Check [Testing Guide](./Internal/Development/TESTING_GUIDE.md)

### I'm a DevOps Engineer
1. Review [Infrastructure Plan](./Internal/Infrastructure/INFRASTRUCTURE_MIGRATION_PLAN.md)
2. Check [Deployment Guide](./Internal/Deployment/DEPLOYMENT_ROADMAP.md)
3. Set up [Monitoring](./Internal/Infrastructure/observability.md)
4. Review [Runbooks](./Runbooks/)

### I'm a Business Owner
1. Review [Sales Strategy](./Internal/Sales/CIALDINI_SALES_STRATEGY.md)
2. Check [Automation Guide](./Internal/Automation/ZERO_TOUCH_AUTOMATION_GUIDE.md)
3. Review [Project Status](./Internal/Deployment/)

---

## 📝 Documentation Standards

### File Naming
- Use `SCREAMING_SNAKE_CASE.md` for internal docs
- Use `kebab-case.md` for customer-facing docs
- Prefix with numbers for ordered sequences (e.g., `01-quickstart.md`)

### Content Structure
- Start with clear H1 title
- Include table of contents for docs >500 lines
- Use code blocks with language identifiers
- Include examples and diagrams where helpful
- End with "Last Updated" date

### Maintenance
- Review quarterly for accuracy
- Update with each major release
- Archive outdated documentation
- Keep internal and customer docs synchronized

---

**Last Updated**: 2025-11-04
**Maintained By**: ApexMediation Engineering Team
**Questions?** Contact: dev@bel-consulting.ee
