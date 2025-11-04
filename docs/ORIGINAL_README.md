# 🚀 ApexMediation - Enterprise Ad Mediation Platform

**Production-ready ad mediation platform built to compete with Unity LevelPlay**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/go-1.21+-blue.svg)](https://golang.org)
[![Node Version](https://img.shields.io/badge/node-20+-green.svg)](https://nodejs.org)

**Entity:** Bel Consulting OÜ (Estonia), daughter of Starz Energies (US)  
**Mission:** Build and deploy ApexMediation, an enterprise-grade ad mediation platform with OTA-proof reliability, <0.02% ANR contribution, transparent bid landscapes, multi-rail payments, and developer-first trust.

## 🎯 Project Overview

This platform addresses Unity's critical failures:
- **Aug 2024 OTA Crash** → Signed configs, staged rollouts, auto-rollback
- **High ANR Rates** → Thread-safe architecture, <0.02% guaranteed
- **Payment Issues** → Multi-rail weekly payouts, 99.95% reliability
- **Lack of Transparency** → Per-impression bid landscapes
- **Trust Deficit** → Open-source tools, public metrics

## 📁 Repository Structure

```
/
├── sdk/                    # Mobile SDKs (Android, iOS, Unity)
├── backend/               # Backend services (Go, TypeScript, Python)
├── console/               # Publisher dashboard (Next.js)
├── infrastructure/        # Terraform + Kubernetes
├── data/                  # Schemas, migrations, analytics
├── quality/               # Testing & chaos engineering
├── docs/                  # Documentation
└── tools/                 # Migration & debugging tools
```

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18
- Go >= 1.21
- Python >= 3.11
- Docker & Docker Compose
- Terraform >= 1.5
- kubectl >= 1.28

### Development Setup

```bash
# Clone repository
git clone https://github.com/bel-consulting/apex-mediation.git
cd apex-mediation

# Install dependencies
npm install

# Start development environment
docker-compose up -d

# Run tests
npm test
```

## 📚 Documentation

- [API Documentation](./docs/api/README.md)
- [SDK Integration Guide](./docs/sdk/README.md)
- [Migration from Unity](./docs/migration/README.md)
- [Operational Runbooks](./docs/runbooks/README.md)

## 🏗️ Architecture Highlights

### Thread-Safe SDK
- All network I/O on background threads
- StrictMode enforcement (Android)
- Circuit breakers per adapter
- <500KB core SDK size

### Configuration Safety
- Ed25519 cryptographic signing
- Staged rollouts (1% → 5% → 25% → 100%)
- Automatic rollback on SLO breach
- Kill switches within 30 seconds

### Hybrid Auction
- Server-side bidding (primary)
- Header bidding (secondary)
- Waterfall fallback
- <100ms p99 latency

### Multi-Rail Payments
- Weekly payouts (vs Unity monthly)
- Multiple providers (Tipalti, Wise, Payoneer)
- Automatic failover
- Double-entry ledger

## 📊 Performance Targets

| Metric | Target | Unity Comparison |
|--------|--------|------------------|
| SDK Size | <500KB | ~2MB |
| ANR Rate | <0.02% | >0.1% |
| Crash-Free | ≥99.9% | ~99% |
| Payment Success | ≥99.95% | ~98% |
| P99 Latency | ≤100ms | ~150ms |

## 🛠️ Development Roadmap

### Phase 1: Foundation (Days 0-30)
- [x] Monorepo structure
- [ ] Core SDK architecture
- [ ] Configuration service
- [ ] Basic auction engine

### Phase 2: Privacy & Payments (Days 31-60)
- [ ] Privacy compliance (iOS ATT, Privacy Sandbox)
- [ ] Payment orchestration
- [ ] Multi-rail integration

### Phase 3: Intelligence & Scale (Days 61-90)
- [ ] Fraud detection (GIVT/SIVT)
- [ ] ML optimization
- [ ] Load testing (1M QPS)

### Phase 4: Production Ready (Days 91-120)
- [ ] Partner integrations
- [ ] Unity migration tools
- [ ] Beta program
- [ ] Public launch

## 🧪 Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Load tests (K6)
npm run test:load

# Chaos engineering
npm run test:chaos
```

## 🔒 Security

- Ed25519 signing for configs
- AES-256-GCM encryption at rest
- TLS 1.3 for transit
- Certificate pinning in SDKs
- HSM for production keys

## 📈 Monitoring

- **Metrics:** Prometheus + Grafana
- **Logs:** Loki
- **Traces:** Jaeger
- **Alerts:** PagerDuty
- **Status:** https://status.platform.com

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

Proprietary - Copyright © 2025 Bel Consulting OÜ

## 📞 Contact

- **Email:** founders@platform.com
- **Status Page:** https://status.platform.com
- **Developer Portal:** https://developers.platform.com
- **Discord:** https://discord.gg/rival-ad-stack

---

**Built with ❤️ by Bel Consulting OÜ**
