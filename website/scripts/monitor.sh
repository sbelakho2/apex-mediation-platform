#!/bin/bash

# Website Health Monitor
# Monitors website health and performance metrics

set -e

# Configuration
WEBSITE_URL="${WEBSITE_URL:-https://apexmediation.bel-consulting.ee}"
CHECK_INTERVAL="${CHECK_INTERVAL:-60}" # seconds
ALERT_EMAIL="${ALERT_EMAIL:-dev@bel-consulting.ee}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Logging
log_status() {
    local status=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $status: $message" >> monitor.log
}

# Check website health
check_health() {
    local url=$1
    local response=$(curl -s -w "\n%{http_code}\n%{time_total}" "$url")
    local body=$(echo "$response" | head -n -2)
    local status_code=$(echo "$response" | tail -n 2 | head -n 1)
    local response_time=$(echo "$response" | tail -n 1)

    echo "$status_code|$response_time"
}

# Check SSL certificate
check_ssl() {
    local domain=$(echo "$WEBSITE_URL" | sed -E 's|https?://([^/]+).*|\1|')
    local expiry=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -dates | grep notAfter | cut -d= -f2)
    local expiry_epoch=$(date -j -f "%b %d %T %Y %Z" "$expiry" "+%s" 2>/dev/null || date -d "$expiry" "+%s" 2>/dev/null)
    local now_epoch=$(date "+%s")
    local days_until_expiry=$(( ($expiry_epoch - $now_epoch) / 86400 ))

    echo "$days_until_expiry"
}

# Check performance metrics
check_performance() {
    local url=$1

    # Get Core Web Vitals using Lighthouse CI (if available)
    if command -v lhci &> /dev/null; then
        lhci autorun --collect.url="$url" --collect.numberOfRuns=1
    fi
}

# Send alert
send_alert() {
    local subject=$1
    local message=$2

    # Log alert
    log_status "ALERT" "$subject: $message"

    # Send email (if mail command available)
    if command -v mail &> /dev/null; then
        echo "$message" | mail -s "$subject" "$ALERT_EMAIL"
    fi

    # Print to console
    echo -e "${RED}🚨 ALERT: $subject${NC}"
    echo "$message"
}

# Main monitoring loop
monitor() {
    echo "======================================"
    echo "   ApexMediation Website Monitor"
    echo "======================================"
    echo "Monitoring: $WEBSITE_URL"
    echo "Interval: ${CHECK_INTERVAL}s"
    echo "Press Ctrl+C to stop"
    echo ""

    local consecutive_failures=0
    local max_failures=3

    while true; do
        # Check health
        local health=$(check_health "$WEBSITE_URL")
        local status_code=$(echo "$health" | cut -d'|' -f1)
        local response_time=$(echo "$health" | cut -d'|' -f2)

        # Evaluate health
        if [ "$status_code" == "200" ]; then
            consecutive_failures=0

            # Check response time
            local response_time_ms=$(echo "$response_time * 1000" | bc)
            local response_time_int=${response_time_ms%.*}

            if [ "$response_time_int" -lt 1000 ]; then
                echo -e "${GREEN}✅ Healthy${NC} | Status: $status_code | Response: ${response_time}s"
                log_status "HEALTHY" "Status: $status_code, Response: ${response_time}s"
            elif [ "$response_time_int" -lt 3000 ]; then
                echo -e "${YELLOW}⚠️  Slow${NC} | Status: $status_code | Response: ${response_time}s"
                log_status "SLOW" "Status: $status_code, Response: ${response_time}s"
            else
                echo -e "${RED}🐌 Very Slow${NC} | Status: $status_code | Response: ${response_time}s"
                log_status "VERY_SLOW" "Status: $status_code, Response: ${response_time}s"
                send_alert "Website Performance Degraded" "Response time: ${response_time}s (threshold: 3s)"
            fi
        else
            consecutive_failures=$((consecutive_failures + 1))
            echo -e "${RED}❌ Unhealthy${NC} | Status: $status_code | Failures: $consecutive_failures/$max_failures"
            log_status "UNHEALTHY" "Status: $status_code, Consecutive failures: $consecutive_failures"

            if [ "$consecutive_failures" -ge "$max_failures" ]; then
                send_alert "Website Down" "Website returned status code $status_code after $consecutive_failures consecutive failures"
            fi
        fi

        # Check SSL certificate (once per hour)
        if [ $(($(date +%M) % 60)) -eq 0 ]; then
            local days_until_expiry=$(check_ssl)

            if [ "$days_until_expiry" -lt 30 ]; then
                echo -e "${YELLOW}⚠️  SSL certificate expires in $days_until_expiry days${NC}"
                log_status "SSL_WARNING" "Certificate expires in $days_until_expiry days"

                if [ "$days_until_expiry" -lt 7 ]; then
                    send_alert "SSL Certificate Expiring Soon" "Certificate expires in $days_until_expiry days"
                fi
            fi
        fi

        sleep "$CHECK_INTERVAL"
    done
}

# One-time health check
check() {
    echo "Checking $WEBSITE_URL..."

    local health=$(check_health "$WEBSITE_URL")
    local status_code=$(echo "$health" | cut -d'|' -f1)
    local response_time=$(echo "$health" | cut -d'|' -f2)

    echo "Status Code: $status_code"
    echo "Response Time: ${response_time}s"

    if [ "$status_code" == "200" ]; then
        echo -e "${GREEN}✅ Website is healthy${NC}"
        exit 0
    else
        echo -e "${RED}❌ Website is unhealthy${NC}"
        exit 1
    fi
}

# Main
case "$1" in
    monitor)
        monitor
        ;;
    check)
        check
        ;;
    *)
        echo "Usage: $0 {monitor|check}"
        echo ""
        echo "Commands:"
        echo "  monitor  - Start continuous monitoring"
        echo "  check    - Perform one-time health check"
        echo ""
        echo "Environment variables:"
        echo "  WEBSITE_URL       - Website URL to monitor (default: https://apexmediation.bel-consulting.ee)"
        echo "  CHECK_INTERVAL    - Check interval in seconds (default: 60)"
        echo "  ALERT_EMAIL       - Email address for alerts (default: dev@bel-consulting.ee)"
        exit 1
        ;;
esac
