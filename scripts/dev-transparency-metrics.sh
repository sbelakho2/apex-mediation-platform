#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PRIVATE_KEY=$(cat <<'EOF'
-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIHAl7613DK3tf/nayn8Q9FPzfPDT+oyfHTbS3XZL8yRg
-----END PRIVATE KEY-----
EOF
)

SMOKE_ENV_TAG="transparency-smoke-test"
JWT_SECRET="smoke-test-secret"
JWT_TOKEN="$(JWT_SECRET="$JWT_SECRET" node -e "const jwt = require('jsonwebtoken'); const secret = process.env.JWT_SECRET; const token = jwt.sign({ userId: 'smoke-user', publisherId: 'pub-42', email: 'smoke@example.com', role: 'admin' }, secret, { expiresIn: '2h' }); process.stdout.write(token);")"

if [[ -z "$JWT_TOKEN" ]]; then
  echo "Failed to generate JWT token for smoke test" >&2
  exit 1
fi

POSTGRES_URL="postgresql://postgres:postgres@localhost:5432/apexmediation"
CLICKHOUSE_URL="http://localhost:8123"
REDIS_URL="redis://localhost:6379"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for the transparency smoke test" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the transparency smoke test" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required for the transparency smoke test" >&2
  exit 1
fi

wait_for_port() {
  local host="$1"
  local port="$2"
  local retries="${3:-60}"

  for ((i=0; i<retries; i++)); do
    if (echo >"/dev/tcp/${host}/${port}" >/dev/null 2>&1); then
      return 0
    fi
    sleep 2
  done
  echo "Timeout waiting for ${host}:${port}" >&2
  return 1
}

cleanup() {
  set +e
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  docker compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT

cd "$ROOT_DIR"

echo "Resetting previous containers (if any)..."
docker compose down --volumes --remove-orphans >/dev/null 2>&1 || true

echo "Starting infrastructure containers..."
docker compose up -d postgres redis clickhouse

echo "Waiting for postgres on 5432..."
wait_for_port "localhost" 5432

echo "Verifying postgres is ready to accept connections..."
until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done
sleep 3

echo "Waiting for clickhouse on 8123..."
wait_for_port "localhost" 8123

echo "Waiting for redis on 6379..."
wait_for_port "localhost" 6379 "30"

echo "Running database migrations..."
DATABASE_URL="$POSTGRES_URL" npm --prefix "$BACKEND_DIR" run migrate

echo "Initializing ClickHouse schema..."
CLICKHOUSE_URL="$CLICKHOUSE_URL" CLICKHOUSE_DATABASE="apexmediation" npm --prefix "$BACKEND_DIR" run clickhouse:init > /dev/null

echo "Building backend..."
npm --prefix "$BACKEND_DIR" run build > /dev/null

echo "Starting backend server..."
PORT=4000 \
NODE_ENV=test \
APP_ENV="$SMOKE_ENV_TAG" \
API_VERSION=v1 \
DATABASE_URL="$POSTGRES_URL" \
CLICKHOUSE_URL="$CLICKHOUSE_URL" \
CLICKHOUSE_DATABASE="apexmediation" \
REDIS_URL="$REDIS_URL" \
TRANSPARENCY_ENABLED=1 \
TRANSPARENCY_API_ENABLED=true \
TRANSPARENCY_SAMPLE_BPS=10000 \
TRANSPARENCY_PRIVATE_KEY="$PRIVATE_KEY" \
TRANSPARENCY_KEY_ID="dev-ed25519" \
TRANSPARENCY_RETRY_ATTEMPTS=1 \
TRANSPARENCY_RETRY_MIN_DELAY_MS=5 \
TRANSPARENCY_RETRY_MAX_DELAY_MS=50 \
TRANSPARENCY_BREAKER_THRESHOLD=2 \
TRANSPARENCY_BREAKER_COOLDOWN_MS=2000 \
PROMETHEUS_COLLECT_DEFAULTS=0 \
JWT_SECRET="$JWT_SECRET" \
node "$BACKEND_DIR/dist/src/index.js" > "$BACKEND_DIR/.transparency-metrics.log" 2>&1 &
SERVER_PID=$!

until curl -sf "http://localhost:4000/health" >/dev/null; do
  sleep 2
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "Backend process exited unexpectedly" >&2
    tail -n 50 "$BACKEND_DIR/.transparency-metrics.log" >&2 || true
    exit 1
  fi
done

echo "Backend ready. Seeding transparency writes (success path)..."

send_bid() {
  local request_id="$1"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    "http://localhost:4000/api/v1/rtb/bid" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -d "{\
      \"id\": \"${request_id}\",\
      \"imp\": [{\
        \"id\": \"imp-1\",\
        \"tagid\": \"placement-001\",\
        \"bidfloor\": 0.5,\
        \"bidfloorcur\": \"USD\",\
        \"banner\": {\
          \"w\": 320,\
          \"h\": 50\
        }\
      }],\
      \"app\": {\
        \"id\": \"app-1\",\
        \"publisher\": { \"id\": \"pub-42\" }\
      },\
      \"device\": {\
        \"os\": \"iOS\",\
        \"ip\": \"192.0.2.1\"\
      },\
      \"user\": {\
        \"id\": \"user-${request_id}\",\
        \"consent\": \"CPXxRfAPXxRfAABABBENCuCsAP_AAH_AACiQHgABAAEAAAAgAgA\"\
      }\
    }")

  if [[ "$status" -ge 400 ]]; then
    echo "$status"
    return 1
  fi
  return 0
}

for n in 1 2 3; do
  if send_bid "success-${n}"; then
    echo "Seed request success-${n} returned <400"
  else
    echo "Seed request success-${n} returned non-success status" >&2
  fi
  sleep 0.5
done

echo "Simulating ClickHouse outage to trigger retries and breaker..."
docker compose stop clickhouse >/dev/null
sleep 2

for n in 1 2 3; do
  if ! send_bid "failure-${n}"; then
    echo "Expected non-success recorded for failure-${n}" >&2
  fi
  sleep 0.5
done

sleep 2

echo "Prometheus metrics snapshot:"
PROM_METRICS=$(curl -sf -H "Authorization: Bearer $JWT_TOKEN" "http://localhost:4000/metrics")
echo "$PROM_METRICS" | grep "transparency_writer" || { echo "No transparency metrics found" >&2; exit 1; }

for metric in \
  "transparency_writer_writes_attempted_total" \
  "transparency_writer_writes_failed_total" \
  "transparency_writer_breaker_skipped_total" \
  "transparency_writer_breaker_open" \
  "transparency_writer_failure_streak"; do
  if ! echo "$PROM_METRICS" | grep -q "$metric"; then
    echo "Missing Prometheus metric: $metric" >&2
    exit 1
  fi
done

echo

echo "Transparency JSON metrics:"
HTTP_CODE=$(curl -s -o /tmp/json_metrics.json -w "%{http_code}" -H "Authorization: Bearer $JWT_TOKEN" "http://localhost:4000/api/v1/transparency/metrics")

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Failed to fetch JSON metrics (HTTP $HTTP_CODE)"
  cat /tmp/json_metrics.json
  exit 1
fi

python3 <<'PY'
import json

with open('/tmp/json_metrics.json', 'r') as f:
    payload = json.load(f)
if not payload.get("success"):
    raise SystemExit("Transparency metrics endpoint did not report success")

metrics = payload.get("data", {})
expected_keys = {
    "writes_attempted",
    "writes_succeeded",
    "writes_failed",
    "sampled",
    "unsampled",
    "breaker_skipped",
    "breaker_open",
    "failure_streak",
    "breaker_cooldown_remaining_ms",
}

missing = sorted(expected_keys - metrics.keys())
if missing:
    raise SystemExit(f"Missing JSON metrics keys: {', '.join(missing)}")

print(json.dumps(metrics, indent=2))
PY

echo "\nSmoke test completed; environment tagged as $SMOKE_ENV_TAG"
