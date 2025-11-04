#!/bin/bash

# Automated Accounting System - Dependency Installation
# This script installs all required npm packages for the accounting services

set -e

echo "=================================================="
echo "Installing Accounting System Dependencies"
echo "=================================================="
echo ""

cd "$(dirname "$0")/../backend"

echo "📦 Installing payment processing dependencies..."
npm install stripe@latest

echo "📄 Installing PDF generation dependencies..."
npm install pdfkit@latest
npm install --save-dev @types/pdfkit

echo "☁️  Installing AWS S3 dependencies..."
npm install @aws-sdk/client-s3@latest

echo "🔧 Installing utility dependencies..."
npm install fast-xml-parser@latest
npm install date-fns@latest

echo ""
echo "✅ All dependencies installed successfully!"
echo ""
echo "Next steps:"
echo "1. Configure environment variables in .env:"
echo "   - ESTONIAN_COMPANY_CODE=16736399"
echo "   - ESTONIAN_VAT_NUMBER=EE102736890"
echo "   - S3_ACCOUNTING_BUCKET=rivalapexmediation-accounting"
echo "   - STRIPE_SECRET_KEY=sk_live_..."
echo "   - STRIPE_WEBHOOK_SECRET=whsec_..."
echo ""
echo "2. Run database migration:"
echo "   psql -h localhost -U rivalapexmediation -d rivalapexmediation < backend/migrations/007_accounting_system.sql"
echo ""
echo "3. Set up S3 bucket with Object Lock:"
echo "   ./scripts/setup-s3-accounting.sh"
echo ""
echo "4. Run integration tests:"
echo "   npm test backend/services/accounting/"
echo ""
