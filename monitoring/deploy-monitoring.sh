#!/bin/bash
# Deploy ApexMediation Monitoring Stack
# Usage: ./deploy-monitoring.sh [start|stop|restart|logs|status]

set -e

COMMAND=${1:-start}
MONITORING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔍 ApexMediation Monitoring Stack"
echo "   Directory: $MONITORING_DIR"
echo "   Command: $COMMAND"
echo ""

# Load environment variables
if [ -f "$MONITORING_DIR/.env" ]; then
  source "$MONITORING_DIR/.env"
  echo "✅ Environment variables loaded"
else
  echo "⚠️  No .env file found. Creating template..."
  cat > "$MONITORING_DIR/.env" <<EOF
# Grafana
GRAFANA_PASSWORD=changeme

# Email alerts
RESEND_API_KEY=re_...

# Database (for Grafana datasource)
DATABASE_URL=postgresql://...
DB_USER=readonly_user
DB_PASSWORD=...

# ClickHouse (for analytics queries)
CLICKHOUSE_URL=https://...
CLICKHOUSE_PASSWORD=...

# Optional: SMS alerts via Twilio
TWILIO_WEBHOOK_URL=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=

# Optional: Slack notifications
SLACK_WEBHOOK_URL=

# Optional: Discord notifications
DISCORD_WEBHOOK_URL=
EOF
  echo "⚠️  Please edit .env file with your credentials, then run again"
  exit 1
fi

case $COMMAND in
  start)
    echo "🚀 Starting monitoring stack..."
    cd "$MONITORING_DIR"
    docker-compose up -d
    
    echo ""
    echo "⏳ Waiting for services to be ready..."
    sleep 10
    
    # Check service health
    echo ""
    echo "🏥 Health checks:"
    
    if curl -f -s http://localhost:9090/-/healthy > /dev/null; then
      echo "  ✅ Prometheus: http://localhost:9090"
    else
      echo "  ❌ Prometheus: Not healthy"
    fi
    
    if curl -f -s http://localhost:3100/ready > /dev/null; then
      echo "  ✅ Loki: http://localhost:3100"
    else
      echo "  ❌ Loki: Not healthy"
    fi
    
    if curl -f -s http://localhost:3000/api/health > /dev/null; then
      echo "  ✅ Grafana: http://localhost:3000 (admin / $GRAFANA_PASSWORD)"
    else
      echo "  ❌ Grafana: Not healthy"
    fi
    
    if curl -f -s http://localhost:9093/-/healthy > /dev/null; then
      echo "  ✅ Alertmanager: http://localhost:9093"
    else
      echo "  ❌ Alertmanager: Not healthy"
    fi
    
    echo ""
    echo "✨ Monitoring stack started!"
    echo ""
    echo "Next steps:"
    echo "  1. Open Grafana: http://localhost:3000"
    echo "  2. Login: admin / $GRAFANA_PASSWORD"
    echo "  3. Import dashboards from monitoring/dashboards/"
    echo "  4. Configure alert channels in Alertmanager"
    echo "  5. Test alerts: docker-compose exec prometheus promtool test rules alerts.yml"
    ;;
  
  stop)
    echo "🛑 Stopping monitoring stack..."
    cd "$MONITORING_DIR"
    docker-compose down
    echo "✅ Monitoring stack stopped"
    ;;
  
  restart)
    echo "🔄 Restarting monitoring stack..."
    cd "$MONITORING_DIR"
    docker-compose restart
    echo "✅ Monitoring stack restarted"
    ;;
  
  logs)
    SERVICE=${2:-all}
    if [ "$SERVICE" == "all" ]; then
      echo "📋 Showing logs for all services (Ctrl+C to exit)..."
      cd "$MONITORING_DIR"
      docker-compose logs -f
    else
      echo "📋 Showing logs for $SERVICE (Ctrl+C to exit)..."
      cd "$MONITORING_DIR"
      docker-compose logs -f "$SERVICE"
    fi
    ;;
  
  status)
    echo "📊 Monitoring stack status:"
    cd "$MONITORING_DIR"
    docker-compose ps
    
    echo ""
    echo "💾 Disk usage:"
    du -sh prometheus-data loki-data grafana-data alertmanager-data 2>/dev/null || echo "  No data volumes found"
    ;;
  
  backup)
    echo "💾 Backing up monitoring data..."
    BACKUP_DIR="$MONITORING_DIR/backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    cd "$MONITORING_DIR"
    docker-compose exec -T prometheus tar czf - /prometheus > "$BACKUP_DIR/prometheus.tar.gz"
    docker-compose exec -T loki tar czf - /loki > "$BACKUP_DIR/loki.tar.gz"
    docker-compose exec -T grafana tar czf - /var/lib/grafana > "$BACKUP_DIR/grafana.tar.gz"
    
    echo "✅ Backup saved to $BACKUP_DIR"
    ;;
  
  test-alerts)
    echo "🧪 Testing alert rules..."
    cd "$MONITORING_DIR"
    docker-compose exec prometheus promtool check rules /etc/prometheus/alerts.yml
    
    echo ""
    echo "📧 Sending test alert..."
    curl -X POST http://localhost:9093/api/v1/alerts \
      -H "Content-Type: application/json" \
      -d '[{
        "labels": {
          "alertname": "TestAlert",
          "severity": "info",
          "service": "monitoring"
        },
        "annotations": {
          "summary": "Test alert from monitoring setup",
          "description": "This is a test alert to verify email delivery is working."
        }
      }]'
    
    echo ""
    echo "✅ Test alert sent. Check your email."
    ;;
  
  *)
    echo "Usage: ./deploy-monitoring.sh [start|stop|restart|logs|status|backup|test-alerts]"
    echo ""
    echo "Commands:"
    echo "  start        - Start monitoring stack"
    echo "  stop         - Stop monitoring stack"
    echo "  restart      - Restart monitoring stack"
    echo "  logs [svc]   - Show logs (optionally for specific service)"
    echo "  status       - Show service status and resource usage"
    echo "  backup       - Backup monitoring data"
    echo "  test-alerts  - Test alert rules and email delivery"
    exit 1
    ;;
esac
