#!/bin/bash
# Deploy ApexMediation Backend to Fly.io
# Usage: ./deploy-backend.sh [staging|production]

set -e

ENVIRONMENT=${1:-staging}
APP_NAME="apexmediation-backend"

if [ "$ENVIRONMENT" == "production" ]; then
  APP_NAME="apexmediation-backend-prod"
  PRIMARY_REGION="sjc"
  MIN_MACHINES=2
  MAX_MACHINES=10
else
  APP_NAME="apexmediation-backend-staging"
  PRIMARY_REGION="sjc"
  MIN_MACHINES=1
  MAX_MACHINES=3
fi

echo "🚀 Deploying ApexMediation Backend to Fly.io ($ENVIRONMENT)"
echo "   App: $APP_NAME"
echo "   Region: $PRIMARY_REGION"
echo ""

# Check if Fly CLI is installed
if ! command -v fly &> /dev/null; then
  echo "❌ Fly CLI not found. Installing..."
  curl -L https://fly.io/install.sh | sh
  export FLYCTL_INSTALL="$HOME/.fly"
  export PATH="$FLYCTL_INSTALL/bin:$PATH"
fi

# Check if logged in
if ! fly auth whoami &> /dev/null; then
  echo "❌ Not logged in to Fly.io. Please run: fly auth login"
  exit 1
fi

echo "✅ Fly CLI ready"
echo ""

# Check if app exists
if ! fly apps list | grep -q "$APP_NAME"; then
  echo "📦 Creating new Fly.io app: $APP_NAME"
  fly apps create "$APP_NAME" --org personal
  echo "✅ App created"
else
  echo "✅ App exists: $APP_NAME"
fi

# Set secrets (only if not already set)
echo ""
echo "🔐 Checking secrets..."

# Check if secrets are set
SECRETS_SET=$(fly secrets list --app "$APP_NAME" 2>/dev/null | wc -l)

if [ "$SECRETS_SET" -lt 5 ]; then
  echo "⚠️  Secrets not set. Please set the following secrets:"
  echo ""
  echo "  fly secrets set --app $APP_NAME \\"
  echo "    DATABASE_URL='postgresql://...' \\"
  echo "    CLICKHOUSE_URL='https://...' \\"
  echo "    CLICKHOUSE_PASSWORD='...' \\"
  echo "    UPSTASH_REDIS_URL='https://...' \\"
  echo "    UPSTASH_REDIS_TOKEN='...' \\"
  echo "    STRIPE_SECRET_KEY='sk_...' \\"
  echo "    STRIPE_WEBHOOK_SECRET='whsec_...' \\"
  echo "    RESEND_API_KEY='re_...' \\"
  echo "    JWT_SECRET='...'"
  echo ""
  read -p "Press Enter after setting secrets, or Ctrl+C to cancel..."
else
  echo "✅ Secrets configured"
fi

# Build and deploy
echo ""
echo "🏗️  Building Docker image..."
cd "$(dirname "$0")"

# Update fly.toml with environment-specific settings
if [ "$ENVIRONMENT" == "production" ]; then
  sed -i.bak "s/app = .*/app = \"$APP_NAME\"/" fly.toml
  sed -i.bak "s/min_machines_running = .*/min_machines_running = $MIN_MACHINES/" fly.toml
  rm fly.toml.bak
fi

echo "✅ Docker image built"
echo ""

# Deploy
echo "🚀 Deploying to Fly.io..."
fly deploy --app "$APP_NAME" --region "$PRIMARY_REGION" --ha=false

echo ""
echo "✅ Deployment complete!"
echo ""

# Show status
echo "📊 App status:"
fly status --app "$APP_NAME"
echo ""

# Show URL
APP_URL="https://$APP_NAME.fly.dev"
echo "🌍 App URL: $APP_URL"
echo ""

# Health check
echo "🏥 Running health check..."
sleep 10 # Wait for app to start

if curl -f -s "$APP_URL/health" > /dev/null; then
  echo "✅ Health check passed"
  echo ""
  echo "🎉 Deployment successful!"
  echo ""
  echo "Next steps:"
  echo "  1. Test API: curl $APP_URL/api/v1/health"
  echo "  2. View logs: fly logs --app $APP_NAME"
  echo "  3. Monitor: fly dashboard --app $APP_NAME"
  echo "  4. Scale up: fly scale count $MAX_MACHINES --app $APP_NAME"
  echo ""
else
  echo "❌ Health check failed"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check logs: fly logs --app $APP_NAME"
  echo "  2. Check status: fly status --app $APP_NAME"
  echo "  3. SSH into VM: fly ssh console --app $APP_NAME"
  exit 1
fi

# Enable auto-scaling (production only)
if [ "$ENVIRONMENT" == "production" ]; then
  echo "⚙️  Enabling auto-scaling..."
  fly autoscale set min=$MIN_MACHINES max=$MAX_MACHINES --app "$APP_NAME"
  echo "✅ Auto-scaling enabled: $MIN_MACHINES-$MAX_MACHINES machines"
fi

echo ""
echo "✨ All done! Backend is live at $APP_URL"
