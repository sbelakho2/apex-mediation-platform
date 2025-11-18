# Customer Documentation Structure

_Last updated: 2025-11-18 16:40 UTC_

> **FIX-10 governance:** This index explains where customer-facing docs live. It does **not** assert product completion. Always cross-check `docs/Internal/Deployment/PROJECT_STATUS.md` for readiness and `docs/Internal/Development/FIXES.md` for the prioritized backlog before promising features externally.

This directory contains all customer-facing documentation for the ApexMediation Platform.

## Documentation Categories

### 1. Getting Started
- Quick Start Guide
- Account Setup
- Platform Overview
- Basic Concepts

### 2. Integration Guides
- Unity SDK
- iOS SDK
- Android SDK
- Web SDK
- Prebid Adapter
- Server-to-Server Integration

### 3. API Reference
- Authentication
- RESTful API Endpoints
- WebSocket API
- Webhooks
- Rate Limits & Quotas

### 4. Features & Functionality
- Ad Mediation & Auction
- Real-Time Bidding
- Fraud Detection
- Analytics & Reporting
- Payment Management
- Geographic Discounts

### 5. Billing & Compliance
- Pricing & Plans
- Payment Terms
- Invoicing
- Estonian Tax Compliance
- GDPR Compliance
- Cookie Policy
- Privacy Policy
- Terms of Service

### 6. Troubleshooting
- Common Issues
- Error Codes
- FAQ
- Support Contact

### 7. Advanced Topics
- Custom Bidding Algorithms
- A/B Testing
- Self-Evolving AI System
- Performance Optimization
- Scaling Guidelines

## File Structure

```
docs/Customer-Facing/
├── README.md
├── Getting-Started/
│   ├── quickstart.md
│   ├── account-setup.md
│   ├── platform-overview.md
│   └── basic-concepts.md
│
├── Integration-Guides/
│   ├── unity-sdk.md
│   ├── ios-sdk.md
│   ├── android-sdk.md
│   ├── web-sdk.md
│   ├── prebid-adapter.md
│   └── server-to-server.md
│
├── API-Reference/
│   ├── authentication.md
│   ├── rest-api.md
│   ├── websocket-api.md
│   ├── webhooks.md
│   └── rate-limits.md
│
├── Features/
│   ├── mediation.md
│   ├── rtb.md
│   ├── fraud-detection.md
│   ├── analytics.md
│   ├── payments.md
│   └── geographic-discounts.md
│
├── Billing-Compliance/
│   ├── pricing.md
│   ├── payment-terms.md
│   ├── invoicing.md
│   ├── estonian-tax.md
│   ├── gdpr.md
│   ├── cookie-policy.md
│   ├── privacy-policy.md
│   └── terms-of-service.md
│
├── Troubleshooting/
│   ├── common-issues.md
│   ├── error-codes.md
│   ├── faq.md
│   └── support.md
│
└── Advanced/
    ├── custom-bidding.md
    ├── ab-testing.md
    ├── self-evolving-ai.md
    ├── performance-optimization.md
    └── scaling.md
```

## Documentation Guidelines

### Writing Style
- Clear, concise, and actionable
- Use code examples liberally
- Include screenshots where helpful
- Link to related documentation
- Keep jargon to a minimum

### Code Examples
- Always test code examples before publishing
- Include comments explaining key parts
- Show both success and error cases
- Use realistic but safe API keys (sk_test_xxx)

### Version Management
- Document which SDK/API version is covered
- Note breaking changes clearly
- Provide migration guides for major versions

### Search Optimization
- Use descriptive headings
- Include common search terms
- Add meta descriptions
- Use alt text for images

## Contribution

Internal team members can contribute to documentation:
1. Create a feature branch
2. Write/update documentation in markdown
3. Test all code examples
4. Submit PR for review
5. Documentation team reviews within 2 business days

---

**Next Steps**: See individual documentation files in subdirectories.

## Change Log
| Date | Change |
| --- | --- |
| 2025-11-18 | Added FIX-10 governance notice, updated folder structure, and aligned guidance with `PROJECT_STATUS.md`/`FIXES.md`. |
