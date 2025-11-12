# Scripts Directory

This directory contains utility scripts for development, deployment, and operations. All scripts follow best practices for safety, idempotency, and reliability.

## Table of Contents

- [Available Scripts](#available-scripts)
- [Usage Guidelines](#usage-guidelines)
- [Safety & Idempotency](#safety--idempotency)
- [Environment Variables](#environment-variables)
- [CI Integration](#ci-integration)
- [Troubleshooting](#troubleshooting)

---

## Available Scripts

### Development Scripts

#### `dev-transparency-metrics.sh`
**Purpose**: Smoke test for transparency metrics ingestion and API endpoints.

**Usage**:
```bash
./scripts/dev-transparency-metrics.sh
```

**Prerequisites**:
- Docker and Docker Compose v2
- Node.js 18+ with jsonwebtoken package
- PostgreSQL, ClickHouse, Redis running (via docker-compose)

**What it does**:
1. Generates a JWT token for authentication
2. Starts required services (Postgres, ClickHouse, Redis)
3. Runs transparency metrics API smoke tests
4. Validates metrics ingestion pipeline
5. Cleans up test data

**Idempotency**: ✅ Yes - Can be run multiple times safely. Uses unique test identifiers.

**Exit codes**:
- `0`: All tests passed
- `1`: Tests failed or prerequisites missing

---

#### `verify-console-connection.sh`
**Purpose**: Verify console (Next.js) can connect to backend API.

**Usage**:
```bash
./scripts/verify-console-connection.sh
```

**Prerequisites**:
- Backend running at `http://localhost:4000` (or `BACKEND_URL` env var)
- Console running at `http://localhost:3000` (or `CONSOLE_URL` env var)

**What it does**:
1. Checks backend health endpoint
2. Verifies CORS headers
3. Tests API authentication
4. Validates proxy configuration

**Idempotency**: ✅ Yes - Read-only checks, no state changes.

**Exit codes**:
- `0`: Connection verified
- `1`: Connection failed

---

### Deployment Scripts

#### `validate-deployment.sh`
**Purpose**: Pre-deployment validation checklist. Verifies all production requirements.

**Usage**:
```bash
./scripts/validate-deployment.sh
```

**Prerequisites**:
- Run from project root directory
- Environment variables set (DATABASE_URL, etc.)

**What it does**:
1. **Database Validation**
   - Verifies DATABASE_URL is set
   - Checks migration files (expects 14 migrations)
   - Validates migration file naming

2. **Build Validation**
   - Checks node_modules installed
   - Verifies TypeScript compilation
   - Validates bundle sizes

3. **Configuration Validation**
   - Checks required environment variables
   - Validates API keys and secrets
   - Verifies feature flags

4. **Security Validation**
   - Checks HTTPS configuration
   - Validates JWT_SECRET length (>32 chars)
   - Verifies rate limiting enabled

5. **Monitoring Validation**
   - Checks Prometheus metrics endpoint
   - Validates Grafana dashboard imports
   - Verifies alert rules syntax

**Idempotency**: ✅ Yes - Read-only validation, no destructive operations.

**Exit codes**:
- `0`: All checks passed
- `1`: One or more checks failed (see output for details)

**Output**: Color-coded report with ✅ PASS, ❌ FAIL, ⚠️ WARN categories.

---

### Database Scripts

#### `run-billing-migrations.sh`
**Purpose**: Run database migrations for billing module.

**Usage**:
```bash
./scripts/run-billing-migrations.sh [up|down|status]
```

**Arguments**:
- `up` (default): Apply pending migrations
- `down`: Rollback last migration
- `status`: Show migration status

**Prerequisites**:
- PostgreSQL database accessible
- DATABASE_URL environment variable set

**What it does**:
- Applies SQL migrations from `backend/migrations/billing/`
- Tracks migration history in `schema_migrations` table
- Validates migration checksums

**Idempotency**: ✅ Yes - Migrations are only applied once. Re-running is safe.

**Safety Features**:
- Transaction-wrapped migrations (rollback on failure)
- Checksum validation prevents modified migrations
- Dry-run mode available: `DRY_RUN=1 ./run-billing-migrations.sh`

**Exit codes**:
- `0`: Migrations applied successfully
- `1`: Migration failed or DATABASE_URL missing

---

#### `validate-billing-tests.sh`
**Purpose**: Run billing module integration tests.

**Usage**:
```bash
./scripts/validate-billing-tests.sh
```

**Prerequisites**:
- PostgreSQL test database
- Stripe API test keys (STRIPE_SECRET_KEY_TEST)

**What it does**:
1. Creates isolated test database
2. Runs billing integration tests
3. Validates Stripe webhook signatures
4. Tests invoice generation
5. Cleans up test database

**Idempotency**: ✅ Yes - Uses isolated test database with unique name.

**Exit codes**:
- `0`: All tests passed
- `1`: Tests failed

---

### Infrastructure Scripts

#### `setup-s3-accounting.sh`
**Purpose**: Create S3 bucket with Object Lock for accounting document retention (7 years, Estonian Accounting Act compliance).

**Usage**:
```bash
./scripts/setup-s3-accounting.sh
```

**Prerequisites**:
- AWS CLI configured (`aws configure`)
- IAM permissions: `s3:CreateBucket`, `s3:PutBucketVersioning`, `s3:PutObjectLockConfiguration`

**Environment Variables**:
- `S3_ACCOUNTING_BUCKET`: Bucket name (default: `rivalapexmediation-accounting`)
- `AWS_REGION`: AWS region (default: `eu-north-1` - Stockholm)

**What it does**:
1. Checks if bucket already exists
2. Creates bucket with Object Lock enabled (if new)
3. Enables versioning (required for Object Lock)
4. Configures default retention period (7 years, compliance mode)
5. Sets lifecycle policies for IA/Glacier transitions
6. Configures server-side encryption (AES256)
7. Blocks public access

**Idempotency**: ✅ Yes - Prompts before modifying existing bucket. Safe to re-run.

**Safety Features**:
- Confirmation prompt if bucket exists
- Object Lock prevents accidental deletion
- Compliance mode retention (cannot be shortened)

**Exit codes**:
- `0`: Bucket configured successfully
- `1`: AWS CLI error or permission denied

---

#### `install-accounting-deps.sh`
**Purpose**: Install Python dependencies for accounting/bookkeeping automation.

**Usage**:
```bash
./scripts/install-accounting-deps.sh
```

**Prerequisites**:
- Python 3.9+
- pip installed

**What it does**:
1. Creates virtual environment (if not exists)
2. Installs required packages: `stripe`, `boto3`, `reportlab`, `python-dateutil`
3. Verifies installation

**Idempotency**: ✅ Yes - Virtual environment reused if exists. Safe to re-run.

**Exit codes**:
- `0`: Dependencies installed
- `1`: Python not found or installation failed

---

#### `verify-billing-wiring.sh`
**Purpose**: Verify billing module integration (Stripe webhooks, invoice generation, S3 uploads).

**Usage**:
```bash
./scripts/verify-billing-wiring.sh
```

**Prerequisites**:
- Backend running
- Stripe webhook endpoint configured
- S3 accounting bucket created

**What it does**:
1. Sends test webhook to `/webhooks/stripe`
2. Verifies webhook signature validation
3. Tests invoice PDF generation
4. Validates S3 upload with Object Lock
5. Checks database invoice record

**Idempotency**: ✅ Yes - Uses unique test customer ID. Cleans up test data.

**Exit codes**:
- `0`: All checks passed
- `1`: Wiring verification failed

---

## Usage Guidelines

### General Best Practices

1. **Always run from project root**:
   ```bash
   cd /path/to/Ad-Project
   ./scripts/script-name.sh
   ```

2. **Check prerequisites before running**:
   - Read script header comments
   - Verify required environment variables
   - Ensure services are running

3. **Use dry-run mode when available**:
   ```bash
   DRY_RUN=1 ./scripts/setup-s3-accounting.sh
   ```

4. **Review output carefully**:
   - Scripts use color-coded output (✅ green, ❌ red, ⚠️ yellow)
   - Check exit codes: `echo $?`

5. **Test in staging first**:
   ```bash
   ENV=staging ./scripts/validate-deployment.sh
   ```

---

## Safety & Idempotency

All scripts in this directory follow these principles:

### Idempotency Guarantees

✅ **Safe to re-run**: Scripts check existing state before making changes.

**Examples**:
- Database migrations check if already applied
- S3 setup prompts before modifying existing bucket
- Service startup scripts detect running processes

### Safety Features

1. **Non-destructive by default**: Scripts never delete data without explicit confirmation.

2. **Exit on error** (`set -euo pipefail`):
   - `set -e`: Exit on any error
   - `set -u`: Exit on undefined variables
   - `set -o pipefail`: Catch errors in pipelines

3. **Confirmation prompts** for destructive operations:
   ```bash
   read -p "Do you want to delete the database? (y/n) " -n 1 -r
   ```

4. **Dry-run mode** for infrastructure changes:
   ```bash
   if [ "${DRY_RUN:-0}" = "1" ]; then
     echo "Would create bucket: $BUCKET_NAME"
     exit 0
   fi
   ```

5. **Rollback mechanisms**:
   - Database migrations wrapped in transactions
   - Failed deployments automatically rolled back

---

## Environment Variables

### Required Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `DATABASE_URL` | Most scripts | PostgreSQL connection string |
| `CLICKHOUSE_URL` | Backend scripts | ClickHouse HTTP endpoint |
| `REDIS_URL` | Backend scripts | Redis connection string |
| `JWT_SECRET` | Auth scripts | JWT signing secret (32+ chars) |
| `STRIPE_SECRET_KEY` | Billing scripts | Stripe API key |
| `AWS_ACCESS_KEY_ID` | S3 scripts | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | S3 scripts | AWS credentials |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENV` | `development` | Environment (development/staging/production) |
| `DRY_RUN` | `0` | Set to `1` for dry-run mode |
| `VERBOSE` | `0` | Set to `1` for verbose output |
| `S3_ACCOUNTING_BUCKET` | `rivalapexmediation-accounting` | S3 bucket name |
| `AWS_REGION` | `eu-north-1` | AWS region |
| `BACKEND_URL` | `http://localhost:4000` | Backend API base URL |
| `CONSOLE_URL` | `http://localhost:3000` | Console URL |

### Setting Variables

**Local development** (`.env` file):
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/apexmediation
JWT_SECRET=$(openssl rand -base64 32)
STRIPE_SECRET_KEY=sk_test_...
```

**CI/CD** (GitHub Actions Secrets):
```yaml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
```

**Production** (Kubernetes Secrets):
```bash
kubectl create secret generic backend-secrets \
  --from-literal=DATABASE_URL="postgresql://..." \
  --from-literal=JWT_SECRET="..."
```

---

## CI Integration

Scripts are integrated into CI/CD pipelines for automated validation.

### GitHub Actions Workflows

#### `.github/workflows/ci-all.yml`
- Runs `validate-billing-tests.sh` on every PR
- Executes `validate-deployment.sh` before merging
- Shellcheck validation for all `.sh` files

#### `.github/workflows/nightly-quality.yml`
- Nightly load tests (k6)
- Chaos engineering tests
- Slack notifications on failure

### Adding Scripts to CI

1. **Make script executable**:
   ```bash
   chmod +x scripts/your-script.sh
   ```

2. **Add shellcheck validation** (automatic in CI):
   ```yaml
   - name: Lint shell scripts
     run: shellcheck scripts/*.sh
   ```

3. **Run in CI workflow**:
   ```yaml
   - name: Run validation script
     run: ./scripts/validate-deployment.sh
   ```

### Shellcheck Compliance

All scripts pass `shellcheck` with no warnings. To check locally:

```bash
# Install shellcheck
sudo apt-get install shellcheck  # Debian/Ubuntu
brew install shellcheck          # macOS

# Check all scripts
find scripts -name "*.sh" -type f -exec shellcheck {} +

# Check specific script
shellcheck scripts/validate-deployment.sh
```

**Common issues fixed**:
- Proper quoting of variables: `"$VAR"` instead of `$VAR`
- Use `[[ ]]` instead of `[ ]` for comparisons
- Declare loop variables: `for i in {1..10}; do`
- Check command existence: `command -v docker >/dev/null`

---

## Troubleshooting

### Common Issues

#### 1. Permission Denied

**Error**: `bash: ./scripts/script.sh: Permission denied`

**Solution**:
```bash
chmod +x scripts/script.sh
```

#### 2. Command Not Found

**Error**: `docker: command not found`

**Solution**: Install missing prerequisites (see script header comments).

#### 3. Environment Variable Missing

**Error**: `DATABASE_URL not set in environment`

**Solution**:
```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/db"
# Or add to .env file
```

#### 4. Script Fails Silently

**Solution**: Run with verbose mode:
```bash
VERBOSE=1 ./scripts/script.sh
```

Or enable shell debugging:
```bash
bash -x ./scripts/script.sh
```

#### 5. Migration Already Applied

**Error**: `Migration 001_initial.sql already applied`

**Solution**: This is expected behavior (idempotency). Script will skip already-applied migrations.

To check migration status:
```bash
./scripts/run-billing-migrations.sh status
```

#### 6. S3 Bucket Already Exists

**Error**: `Bucket already exists: rivalapexmediation-accounting`

**Solution**: Script will prompt before modifying. Choose `y` to update configuration or `n` to exit safely.

---

## Contributing

When adding new scripts:

1. **Follow the template**:
   ```bash
   #!/usr/bin/env bash
   # Script Name
   # Description of what it does
   
   set -euo pipefail  # Exit on error, undefined vars, pipe failures
   
   # Your code here
   ```

2. **Add usage documentation** to this README.

3. **Ensure idempotency**: Scripts should be safe to re-run.

4. **Pass shellcheck**: Run `shellcheck your-script.sh` before committing.

5. **Add CI validation** if script is critical for deployment.

6. **Test in isolation**: Verify script works with minimal environment setup.

---

## Quick Reference

| Task | Command |
|------|---------|
| Run all billing tests | `./scripts/validate-billing-tests.sh` |
| Verify deployment readiness | `./scripts/validate-deployment.sh` |
| Setup S3 accounting bucket | `./scripts/setup-s3-accounting.sh` |
| Run database migrations | `./scripts/run-billing-migrations.sh` |
| Smoke test transparency API | `./scripts/dev-transparency-metrics.sh` |
| Verify console connection | `./scripts/verify-console-connection.sh` |
| Check script syntax | `shellcheck scripts/*.sh` |

---

## Support

For issues or questions:
1. Check script output for error messages
2. Review prerequisites in script header
3. Run with `VERBOSE=1` for detailed logs
4. Check GitHub Actions logs if script runs in CI
5. Contact DevOps team for infrastructure scripts

---

**Last Updated**: November 12, 2025  
**Maintained By**: Development Team
