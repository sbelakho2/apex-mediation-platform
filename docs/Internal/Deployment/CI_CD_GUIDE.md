# CI/CD Pipeline Documentation

## Overview

This document describes the complete CI/CD infrastructure for the RivalApexMediation project, including testing, building, security scanning, and deployment workflows.

## Table of Contents

- [Architecture](#architecture)
- [Workflows](#workflows)
- [Configuration](#configuration)
- [Deployment Strategies](#deployment-strategies)
- [Troubleshooting](#troubleshooting)
- [Runbooks](#runbooks)

---

## Architecture

### Pipeline Flow

```
┌─────────────────┐
│   Code Push     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   CI Pipeline   │ ◄── Runs on every push/PR
│   - Tests       │
│   - Lint        │
│   - Security    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Docker Build    │ ◄── On main/tags
│   - Build       │
│   - Scan        │
│   - Sign        │
└────────┬────────┘
         │
         ├───────────────────┐
         ▼                   ▼
┌─────────────────┐  ┌─────────────────┐
│    Staging      │  │   Production    │
│   - Auto        │  │   - Manual      │
│   - E2E Tests   │  │   - Blue-Green  │
└─────────────────┘  └─────────────────┘
```

### Technology Stack

- **CI/CD Platform**: GitHub Actions
- **Container Registry**: GitHub Container Registry (GHCR)
- **Orchestration**: Kubernetes (AWS EKS)
- **Package Manager**: Helm 3
- **Security Scanning**: Trivy, Cosign, Anchore
- **Monitoring**: CloudWatch, Prometheus, Grafana
- **Notifications**: Slack

---

## Workflows

### 1. Main CI Pipeline (`.github/workflows/ci.yml`)

**Trigger**: Every push, pull request

**Purpose**: Comprehensive testing and quality checks

#### Jobs

##### Backend Tests
- **Database Services**: PostgreSQL 15, ClickHouse 23.8, Redis 7
- **Test Execution**: `npm test` with coverage
- **Coverage Upload**: Codecov integration
- **Health Checks**: Ensures services are ready before tests

```yaml
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_PASSWORD: test
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

##### Console Tests
- **Type Checking**: TypeScript compilation
- **Linting**: ESLint with Next.js config
- **Build**: Next.js production build
- **Artifacts**: Build output saved for 7 days

##### SDK Tests

**Android SDK**:
- **Runner**: Ubuntu with JDK 17
- **Dependencies**: Android SDK, Gradle 8.x
- **Caching**: Gradle dependencies
- **Tests**: Unit tests with JUnit

**iOS SDK**:
- **Runner**: macOS-latest
- **Tools**: Xcode 15, Swift 5.9
- **Tests**: XCTest suite
- **Build**: Swift Package Manager

##### Integration Tests
- **Full Stack**: All services running
- **Migrations**: Database schema applied
- **Server Start**: Backend listening on port 3001
- **E2E Tests**: Critical user flows

##### Security Scanning
- **Trivy**: Filesystem vulnerability scan
- **SARIF Upload**: GitHub Code Scanning
- **npm audit**: Dependency vulnerabilities (moderate+)

##### Code Quality
- **ESLint**: JSON output with annotations
- **Artifact Upload**: Quality reports saved

##### CI Success
- **Aggregate Check**: Requires all jobs to pass
- **Branch Protection**: Can be used as required check

#### Usage

Runs automatically on every push and pull request. No manual intervention required.

---

### 2. Docker Build Pipeline (`.github/workflows/docker-build.yml`)

**Trigger**: Push to `main`, `develop`, or tags `v*.*.*`

**Purpose**: Build, scan, and sign container images

#### Jobs

##### Build Backend
- **Docker Buildx**: Multi-platform support
- **Layer Caching**: GitHub Actions cache
- **Metadata Extraction**: Semantic versioning tags
- **Push**: To GitHub Container Registry

**Tags Generated**:
- `latest` (main branch)
- `v1.2.3` (version tags)
- `sha-abc123` (commit SHA)
- `pr-42` (pull requests)

##### Build Console
- **Next.js Optimization**: Static file generation
- **Environment**: Production settings
- **Multi-stage Build**: Minimized image size

##### Scan Images
- **Trivy Scanner**: CRITICAL and HIGH vulnerabilities
- **Exit on Issues**: Blocks deployment if vulnerabilities found
- **SARIF Output**: GitHub Security tab integration

##### Generate SBOM
- **Anchore**: Software Bill of Materials
- **Format**: SPDX JSON
- **Retention**: 90 days
- **Purpose**: Supply chain transparency

##### Sign Images
- **Cosign**: Keyless signing with OIDC
- **Verification**: Sigstore transparency log
- **Purpose**: Image authenticity and integrity

##### Notify
- **GitHub Status**: Commit status updates
- **Links**: Registry URLs for built images

#### Configuration

**Required Secrets**:
- `GITHUB_TOKEN` (automatically provided)

**Registry Login**:
```yaml
- name: Login to GHCR
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

---

### 3. Staging Deployment (`.github/workflows/deploy-staging.yml`)

**Trigger**: Push to `develop` branch

**Purpose**: Automated deployment to staging environment

#### Jobs

##### Pre-Deploy Checks
- **Tests**: Ensure all tests pass
- **Images**: Verify Docker images exist
- **Gates**: Prevent broken deployments

##### Deploy Backend
- **AWS EKS**: Kubernetes cluster connection
- **Helm Release**: `rivalapexmediation-backend`
- **Configuration**:
  - Database URLs from secrets
  - JWT secret for authentication
  - Replicas: 2 for HA
  - Autoscaling: 2-10 pods

##### Deploy Console
- **Helm Release**: `rivalapexmediation-console`
- **Configuration**:
  - API URL: staging backend
  - NextAuth secret
  - Replicas: 1-5 pods

##### Run Migrations
- **Database**: PostgreSQL schema updates
- **ClickHouse**: Analytics tables
- **Timing**: Before new backend pods start

##### Post-Deploy Tests
- **Health Checks**: `/health` endpoints
- **E2E Tests**: Critical user flows
- **Smoke Tests**: Basic functionality
- **Verification**: 30-second wait for stabilization

##### Rollback (on failure)
- **Automatic**: Triggers if any job fails
- **Helm Rollback**: Previous release
- **Notification**: Slack alert

##### Notify
- **Slack Message**: Deployment status
- **Links**: Staging URLs
- **Details**: Commit info, deployer, timestamp

#### Environment Variables

```yaml
STAGING_BACKEND_URL: https://api-staging.rivalapexmediation.com
STAGING_CONSOLE_URL: https://console-staging.rivalapexmediation.com
NAMESPACE: staging
CLUSTER_NAME: rival-staging-eks
```

#### Required Secrets

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `STAGING_DATABASE_URL`
- `STAGING_CLICKHOUSE_URL`
- `STAGING_REDIS_URL`
- `STAGING_JWT_SECRET`
- `STAGING_NEXTAUTH_SECRET`
- `SLACK_WEBHOOK_URL`

---

### 4. Production Deployment (`.github/workflows/deploy-production.yml`)

**Trigger**: Git tags `v*.*.*` or manual workflow dispatch

**Purpose**: Zero-downtime production deployment with blue-green strategy

#### Jobs

##### Validate Release
- **Version Extraction**: From git tag or input
- **Staging Health**: Ensures staging is healthy
- **Image Verification**: Docker images exist
- **Security Scan**: Final vulnerability check

##### Manual Approval (optional)
- **Environment**: `production-approval`
- **Gate**: Requires manual approval in GitHub
- **Skip**: Optional input for emergencies

##### Deploy Green
- **Strategy**: Blue-Green deployment
- **Backend**: 3-20 replicas with autoscaling
- **Console**: 2-10 replicas with autoscaling
- **Color Label**: `green` for new deployment
- **Wait**: 15-minute timeout for deployment

##### Canary Tests
- **Smoke Tests**: Health endpoints
- **Load Test**: 10% of production traffic
- **Duration**: 5 minutes
- **Monitoring**: Error rate < 1%

##### Cutover
- **Traffic Switch**: Update service selectors to `green`
- **Monitoring**: 5-minute observation period
- **Rollback Ready**: Blue deployment still running

##### Verify Production
- **Health Checks**: Public endpoints
- **E2E Tests**: Critical path validation
- **Metrics**: 10-minute monitoring window
- **Thresholds**: Error rate, latency, throughput

##### Cleanup Blue
- **Scale Down**: Old deployment to 0 replicas
- **Retention**: 24 hours for quick rollback
- **Delete**: After 24h confirmation period

##### Create Release
- **Changelog**: Generated from commits
- **Release Notes**: Automated GitHub release
- **Assets**: Build artifacts, documentation

##### Notify
- **Slack**: Deployment status
- **Links**: Production URLs
- **Details**: Version, deployer, metrics

#### Blue-Green Strategy

```
Initial State (Blue Active):
┌──────────────┐
│  Blue (v1.0) │ ◄── 100% traffic
└──────────────┘

Deploy Green:
┌──────────────┐
│  Blue (v1.0) │ ◄── 100% traffic
└──────────────┘
┌──────────────┐
│ Green (v1.1) │ ◄── 0% traffic (canary tests)
└──────────────┘

After Cutover:
┌──────────────┐
│  Blue (v1.0) │ ◄── 0% traffic (standby)
└──────────────┘
┌──────────────┐
│ Green (v1.1) │ ◄── 100% traffic
└──────────────┘

After Cleanup (24h):
┌──────────────┐
│ Green (v1.1) │ ◄── 100% traffic
└──────────────┘
```

#### Required Secrets

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_DEPLOY_ROLE_ARN`
- `PROD_DATABASE_URL`
- `PROD_CLICKHOUSE_URL`
- `PROD_REDIS_URL`
- `PROD_JWT_SECRET`
- `PROD_NEXTAUTH_SECRET`
- `PROD_TEST_USER_EMAIL`
- `PROD_TEST_USER_PASSWORD`
- `SLACK_WEBHOOK_URL`

---

## Configuration

### GitHub Secrets

#### AWS Credentials
```bash
# Create IAM user with EKS permissions
aws iam create-user --user-name github-actions-deploy

# Attach policies
aws iam attach-user-policy --user-name github-actions-deploy \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy

# Create access key
aws iam create-access-key --user-name github-actions-deploy
```

Add to GitHub:
- `AWS_ACCESS_KEY_ID`: From access key creation
- `AWS_SECRET_ACCESS_KEY`: From access key creation

#### Database URLs
```bash
# PostgreSQL
STAGING_DATABASE_URL=postgresql://user:pass@host:5432/rivalad_staging
PROD_DATABASE_URL=postgresql://user:pass@host:5432/rivalad_production

# ClickHouse
STAGING_CLICKHOUSE_URL=http://user:pass@host:8123
PROD_CLICKHOUSE_URL=http://user:pass@host:8123

# Redis
STAGING_REDIS_URL=redis://:pass@host:6379
PROD_REDIS_URL=redis://:pass@host:6379
```

#### Application Secrets
```bash
# Generate JWT secret
openssl rand -base64 32

# Generate NextAuth secret
openssl rand -base64 32
```

#### Slack Webhook
```bash
# Create in Slack: https://api.slack.com/messaging/webhooks
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00/B00/xxx
```

### Helm Values

#### Backend Chart (`infrastructure/helm/backend/values.yaml`)

```yaml
replicaCount: 3

image:
  repository: ghcr.io/yourorg/rivalapexmediation-backend
  pullPolicy: IfNotPresent
  tag: "latest"

service:
  type: ClusterIP
  port: 3001
  selector:
    app: backend
    color: blue  # or green

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi

probes:
  liveness:
    path: /health
    port: 3001
    initialDelaySeconds: 30
    periodSeconds: 10
  readiness:
    path: /health
    port: 3001
    initialDelaySeconds: 10
    periodSeconds: 5

env:
  - name: NODE_ENV
    value: production
  - name: PORT
    value: "3001"
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: backend-secrets
        key: database-url
```

#### Console Chart (`infrastructure/helm/console/values.yaml`)

```yaml
replicaCount: 2

image:
  repository: ghcr.io/yourorg/rivalapexmediation-console
  tag: "latest"

service:
  type: ClusterIP
  port: 3000

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: console.rivalapexmediation.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: console-tls
      hosts:
        - console.rivalapexmediation.com

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 250m
    memory: 256Mi
```

---

## Deployment Strategies

### Staging (Continuous Deployment)

1. **Trigger**: Push to `develop` branch
2. **Validation**: All tests must pass
3. **Deploy**: Automatic Helm upgrade
4. **Verify**: E2E tests
5. **Rollback**: Automatic on failure

**Use Cases**:
- Feature testing
- Integration verification
- Performance testing
- Pre-production validation

### Production (Blue-Green)

1. **Trigger**: Create git tag `v1.2.3`
2. **Validate**: Staging health check
3. **Approval**: Manual gate (optional)
4. **Deploy Green**: New version alongside old
5. **Canary**: Test with subset of traffic
6. **Cutover**: Switch all traffic to green
7. **Monitor**: Observe metrics for 10 minutes
8. **Cleanup**: Scale down blue deployment

**Benefits**:
- Zero downtime
- Instant rollback capability
- Production testing before cutover
- 24-hour rollback window

### Rollback Procedures

#### Quick Rollback (< 10 minutes)

```bash
# Switch traffic back to blue
kubectl patch service rivalapexmediation-backend -n production \
  -p '{"spec":{"selector":{"color":"blue"}}}'

# Scale up blue if scaled down
kubectl scale deployment rivalapexmediation-backend-blue --replicas=3 -n production
```

#### Helm Rollback

```bash
# List releases
helm list -n production

# View history
helm history rivalapexmediation-backend -n production

# Rollback to previous revision
helm rollback rivalapexmediation-backend -n production

# Rollback to specific revision
helm rollback rivalapexmediation-backend 5 -n production
```

---

## Troubleshooting

### CI Pipeline Failures

#### Backend Tests Failing

**Symptoms**: Tests timeout or fail with database errors

**Solutions**:
```bash
# Check service health
# Look for health check failures in workflow logs

# Local reproduction
docker-compose up -d postgres clickhouse redis
npm run test:integration

# Common issues:
# 1. Migration failures - check schema compatibility
# 2. Service not ready - increase health check intervals
# 3. Port conflicts - ensure services use correct ports
```

#### SDK Tests Failing

**Android**:
```bash
# Local test
cd sdk/android
./gradlew test --info

# Common issues:
# 1. JDK version mismatch - ensure JDK 17
# 2. Gradle cache corruption - clear cache
# 3. Network issues - check dependencies
```

**iOS**:
```bash
# Local test
cd sdk/ios
swift test

# Common issues:
# 1. Xcode version - workflow uses Xcode 15
# 2. Swift version - ensure Swift 5.9+
# 3. Signing issues - tests don't require signing
```

### Docker Build Failures

#### Trivy Scan Blocking

**Symptoms**: Build fails with vulnerability warnings

**Solutions**:
```bash
# Run locally
docker pull ghcr.io/yourorg/rivalapexmediation-backend:latest
trivy image --severity CRITICAL,HIGH ghcr.io/yourorg/rivalapexmediation-backend:latest

# Fix vulnerabilities
# 1. Update base image
# 2. Update dependencies
# 3. Apply security patches

# Temporary bypass (not recommended)
# Add to workflow:
# exit-code: '0'  # Warning only
```

#### SBOM Generation Failing

**Symptoms**: Anchore scan errors

**Solutions**:
```bash
# Check image size
docker images | grep rivalapexmediation

# Large images may timeout
# Solution: Optimize Dockerfile, increase timeout
```

### Deployment Failures

#### Helm Deployment Timeout

**Symptoms**: `helm upgrade` times out after 15m

**Solutions**:
```bash
# Check pod status
kubectl get pods -n production

# Describe failing pod
kubectl describe pod <pod-name> -n production

# Check events
kubectl get events -n production --sort-by='.lastTimestamp'

# Common issues:
# 1. Image pull failures - check registry auth
# 2. Resource limits - pods can't schedule
# 3. Health check failures - application not starting
```

#### Rollback Failing

**Symptoms**: Helm rollback command fails

**Solutions**:
```bash
# Force delete stuck resources
kubectl delete pod <pod-name> -n production --force --grace-period=0

# Manual rollback
kubectl patch service rivalapexmediation-backend -n production \
  -p '{"spec":{"selector":{"color":"blue"}}}'

# Scale up previous deployment
kubectl scale deployment rivalapexmediation-backend-blue --replicas=3 -n production
```

### Monitoring and Debugging

#### View Logs

```bash
# Backend logs
kubectl logs -f deployment/rivalapexmediation-backend-green -n production

# Console logs
kubectl logs -f deployment/rivalapexmediation-console-green -n production

# Stream all pods
kubectl logs -f -l app=backend -n production --all-containers=true
```

#### Check Metrics

```bash
# Pod resource usage
kubectl top pods -n production

# Node resource usage
kubectl top nodes

# Horizontal Pod Autoscaler status
kubectl get hpa -n production
```

#### Database Connectivity

```bash
# Create debug pod
kubectl run -it --rm debug --image=postgres:15 --restart=Never -n production -- bash

# Inside pod
psql $DATABASE_URL
\dt
\q
```

---

## Runbooks

### Emergency Rollback

**When**: Production is experiencing critical issues after deployment

**Steps**:

1. **Assess Situation** (2 minutes)
   ```bash
   # Check error rates
   # View CloudWatch dashboards
   # Check Slack alerts
   ```

2. **Quick Rollback** (5 minutes)
   ```bash
   # Switch traffic to blue
   kubectl patch service rivalapexmediation-backend -n production \
     -p '{"spec":{"selector":{"color":"blue"}}}'
   
   kubectl patch service rivalapexmediation-console -n production \
     -p '{"spec":{"selector":{"color":"green"}}}'
   
   # Verify traffic switched
   curl -I https://api.rivalapexmediation.com
   ```

3. **Verify** (3 minutes)
   ```bash
   # Check health
   curl https://api.rivalapexmediation.com/health
   
   # Monitor error rates
   # Wait 5 minutes for stabilization
   ```

4. **Communicate**
   - Post in #incidents Slack channel
   - Update status page
   - Notify on-call team

5. **Post-Mortem**
   - Document issue
   - Create JIRA ticket
   - Schedule review meeting

### Scale Up for Traffic Spike

**When**: Expecting high traffic (product launch, marketing campaign)

**Steps**:

1. **Pre-scale** (1 hour before)
   ```bash
   # Backend
   kubectl scale deployment rivalapexmediation-backend-green --replicas=15 -n production
   
   # Console
   kubectl scale deployment rivalapexmediation-console-green --replicas=8 -n production
   
   # Verify
   kubectl get pods -n production
   ```

2. **Monitor** (during event)
   ```bash
   # Watch HPA
   kubectl get hpa -n production -w
   
   # Watch metrics
   # CloudWatch dashboards
   # Grafana dashboards
   ```

3. **Scale Down** (after event)
   ```bash
   # Let HPA handle it automatically
   # Or manually scale down:
   kubectl scale deployment rivalapexmediation-backend-green --replicas=3 -n production
   ```

### Database Migration Issues

**When**: Migration fails during deployment

**Steps**:

1. **Check Migration Status**
   ```bash
   # Connect to database
   kubectl exec -it <backend-pod> -n production -- npm run migration:status
   ```

2. **Rollback Migration**
   ```bash
   kubectl exec -it <backend-pod> -n production -- npm run migration:down
   ```

3. **Fix Migration**
   - Update migration file
   - Test locally
   - Re-deploy

4. **Manual Migration** (if needed)
   ```bash
   kubectl exec -it <backend-pod> -n production -- npm run migration:up
   ```

---

## Best Practices

### Development Workflow

1. **Feature Development**
   - Create feature branch from `develop`
   - CI runs automatically on PR
   - Require all checks to pass

2. **Staging Testing**
   - Merge to `develop`
   - Auto-deploys to staging
   - Perform QA testing

3. **Production Release**
   - Merge to `main`
   - Create git tag `v1.2.3`
   - Approve production deployment
   - Monitor for issues

### Security

1. **Secrets Management**
   - Never commit secrets
   - Use GitHub Secrets
   - Rotate secrets regularly

2. **Image Scanning**
   - All images scanned with Trivy
   - Block CRITICAL vulnerabilities
   - Generate SBOM for compliance

3. **Image Signing**
   - All production images signed
   - Verify signatures before deployment
   - Maintain audit trail

### Monitoring

1. **Application Metrics**
   - Error rates < 0.1%
   - P95 latency < 200ms
   - Throughput monitored

2. **Infrastructure Metrics**
   - CPU < 70% average
   - Memory < 80% average
   - Disk space > 20% free

3. **Alerts**
   - Slack notifications
   - PagerDuty for critical
   - Weekly reports

---

## Maintenance

### Weekly Tasks

- [ ] Review security scan results
- [ ] Check for dependency updates
- [ ] Review CloudWatch logs for errors
- [ ] Verify backup integrity

### Monthly Tasks

- [ ] Rotate AWS credentials
- [ ] Update base Docker images
- [ ] Review and update autoscaling thresholds
- [ ] Audit GitHub Actions usage costs

### Quarterly Tasks

- [ ] Disaster recovery drill
- [ ] Performance testing
- [ ] Security audit
- [ ] Capacity planning review

---

## Additional Resources

- [Helm Documentation](https://helm.sh/docs/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Kubernetes Best Practices](https://kubernetes.io/docs/concepts/)
- [AWS EKS Workshop](https://www.eksworkshop.com/)
- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [Cosign Documentation](https://docs.sigstore.dev/cosign/overview/)

---

## Support

For issues or questions:
- Slack: #devops
- Email: devops@rivalapexmediation.com
- On-call: PagerDuty rotation
