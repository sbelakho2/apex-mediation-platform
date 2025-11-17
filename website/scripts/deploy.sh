#!/usr/bin/env bash

# Website Deployment Script
# This script handles local deployment and monitoring for ApexMediation website

set -euo pipefail

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBSITE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    log_success "Node.js $(node --version) found"

    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    log_success "npm $(npm --version) found"

    # Check Vercel CLI
    if ! command -v vercel &> /dev/null; then
        log_warning "Vercel CLI not found. Installing..."
        npm install -g vercel
    fi
    log_success "Vercel CLI found"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies (website workspace)..."
    cd "$WEBSITE_ROOT"
    if command -v npm &> /dev/null; then
      if [ -f package-lock.json ]; then
        npm ci
      else
        npm install
      fi
    else
      log_error "npm is not available"
      exit 1
    fi
    log_success "Dependencies installed"
}

# Build website
build_website() {
    log_info "Building website..."
    cd "$WEBSITE_ROOT"
    npm run build
    log_success "Website built successfully"
}

# Run tests
run_tests() {
    log_info "Running tests..."
    cd "$WEBSITE_ROOT"
    npm test || {
      log_warning "Tests failed. Review output above."
      exit 1
    }
    log_success "Tests passed"
}

# Deploy to Vercel
deploy_to_vercel() {
    local environment=$1

    if [ "$environment" == "production" ]; then
        log_info "Deploying to PRODUCTION..."
        vercel --prod
    else
        log_info "Deploying to PREVIEW..."
        vercel
    fi

    log_success "Deployment complete!"
}

# Start development server
start_dev_server() {
    log_info "Starting development server..."
    cd "$WEBSITE_ROOT"
    npm run dev
}

# Monitor deployment
monitor_deployment() {
    log_info "Monitoring deployment..."

    # Get latest deployment
    local deployment_url=$(vercel ls --limit 1 | grep 'https://' | awk '{print $2}')

    if [ -z "$deployment_url" ]; then
        log_error "No deployment found"
        exit 1
    fi

    log_info "Deployment URL: $deployment_url"

    # Check deployment status
    local status_code=$(curl -s -o /dev/null -w "%{http_code}" "$deployment_url")

    if [ "$status_code" == "200" ]; then
        log_success "Deployment is live and healthy!"
    else
        log_error "Deployment returned status code: $status_code"
        exit 1
    fi
}

# Main script
main() {
    echo "======================================"
    echo "   ApexMediation Website Deployment"
    echo "======================================"
    echo ""

    case "$1" in
        check)
            check_prerequisites
            ;;
        install)
            check_prerequisites
            install_dependencies
            ;;
        build)
            check_prerequisites
            install_dependencies
            build_website
            ;;
        test)
            check_prerequisites
            install_dependencies
            run_tests
            ;;
        dev)
            check_prerequisites
            install_dependencies
            start_dev_server
            ;;
        deploy:preview)
            check_prerequisites
            install_dependencies
            build_website
            run_tests
            deploy_to_vercel "preview"
            monitor_deployment
            ;;
        deploy:prod)
            check_prerequisites
            install_dependencies
            build_website
            run_tests
            deploy_to_vercel "production"
            monitor_deployment
            ;;
        monitor)
            monitor_deployment
            ;;
        *)
            echo "Usage: $0 {check|install|build|test|dev|deploy:preview|deploy:prod|monitor}"
            echo ""
            echo "Commands:"
            echo "  check           - Check prerequisites"
            echo "  install         - Install dependencies"
            echo "  build           - Build website"
            echo "  test            - Run tests"
            echo "  dev             - Start development server"
            echo "  deploy:preview  - Deploy to Vercel preview"
            echo "  deploy:prod     - Deploy to Vercel production"
            echo "  monitor         - Monitor deployment status"
            exit 1
            ;;
    esac
}

main "$@"
