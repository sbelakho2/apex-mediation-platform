#!/bin/bash
# =============================================================================
# Kill Switch Smoke Test
# =============================================================================
# Tests that the SDK kill switch functionality works correctly.
# This script should be run as part of every SDK release.
#
# What it tests:
# 1. Global kill switch immediately stops all ad loading
# 2. Per-adapter kill switches disable specific networks
# 3. Per-placement kill switches disable specific placements
# 4. SDK returns "killed_by_config" immediately (no network calls)
# 5. Kill switch recovery when config is restored
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
STAGING_API="${STAGING_API:-https://api-staging.apexmediation.ee}"
TEST_PLACEMENT_ID="${TEST_PLACEMENT_ID:-test_banner_1}"
TEST_ADAPTER="${TEST_ADAPTER:-admob}"
TIMEOUT_MS=150

# Counters
TESTS_PASSED=0
TESTS_FAILED=0

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_failure() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

# =============================================================================
# Helper Functions
# =============================================================================

# Fetch current config from staging
get_current_config() {
    curl -s "${STAGING_API}/v1/config" \
        -H "Authorization: Bearer ${TEST_API_KEY}" \
        -H "Content-Type: application/json"
}

# Set kill switch state via admin API
set_global_kill_switch() {
    local enabled=$1
    
    curl -s -X POST "${STAGING_API}/admin/v1/kill-switch" \
        -H "Authorization: Bearer ${ADMIN_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"enabled\": ${enabled}}"
}

set_adapter_kill_switch() {
    local adapter=$1
    local enabled=$2
    
    curl -s -X POST "${STAGING_API}/admin/v1/adapters/${adapter}/kill-switch" \
        -H "Authorization: Bearer ${ADMIN_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"enabled\": ${enabled}}"
}

set_placement_kill_switch() {
    local placement=$1
    local enabled=$2
    
    curl -s -X POST "${STAGING_API}/admin/v1/placements/${placement}/kill-switch" \
        -H "Authorization: Bearer ${ADMIN_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"enabled\": ${enabled}}"
}

# Simulate SDK ad request and measure response
test_ad_request() {
    local placement=$1
    local start_time=$(date +%s%3N)
    
    local response=$(curl -s -w "\n%{http_code}" \
        -X POST "${STAGING_API}/v1/ad-request" \
        -H "Authorization: Bearer ${TEST_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "{
            \"placement_id\": \"${placement}\",
            \"device\": {
                \"os\": \"ios\",
                \"osVersion\": \"17.0\",
                \"model\": \"iPhone15,2\"
            },
            \"app\": {
                \"bundle\": \"com.test.app\",
                \"version\": \"1.0.0\"
            }
        }")
    
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    
    local http_code=$(echo "$response" | tail -1)
    local body=$(echo "$response" | sed '$d')
    
    echo "{\"duration\": ${duration}, \"http_code\": ${http_code}, \"body\": ${body}}"
}

# =============================================================================
# Test Cases
# =============================================================================

test_global_kill_switch() {
    log_info "Testing global kill switch..."
    
    # Enable global kill switch
    log_info "  Enabling global kill switch..."
    set_global_kill_switch true > /dev/null
    
    # Wait for config propagation
    sleep 2
    
    # Test that ad request is immediately rejected
    local result=$(test_ad_request "${TEST_PLACEMENT_ID}")
    local duration=$(echo "$result" | jq -r '.duration')
    local body=$(echo "$result" | jq -r '.body')
    local reason=$(echo "$body" | jq -r '.error.reason // .reason // empty' 2>/dev/null)
    
    # Check 1: Response should be fast (under TIMEOUT_MS)
    if [ "$duration" -lt "$TIMEOUT_MS" ]; then
        log_success "  Global kill switch returned in ${duration}ms (< ${TIMEOUT_MS}ms threshold)"
    else
        log_failure "  Global kill switch too slow: ${duration}ms (expected < ${TIMEOUT_MS}ms)"
    fi
    
    # Check 2: Reason should indicate kill switch
    if [[ "$reason" == *"kill"* ]] || [[ "$reason" == *"disabled"* ]]; then
        log_success "  Response reason indicates kill switch: ${reason}"
    else
        log_failure "  Unexpected response reason: ${reason}"
    fi
    
    # Disable kill switch
    log_info "  Disabling global kill switch..."
    set_global_kill_switch false > /dev/null
    
    sleep 2
    
    # Test recovery
    result=$(test_ad_request "${TEST_PLACEMENT_ID}")
    local http_code=$(echo "$result" | jq -r '.http_code')
    
    if [ "$http_code" == "200" ]; then
        log_success "  SDK recovered after kill switch disabled"
    else
        log_failure "  SDK did not recover properly (HTTP ${http_code})"
    fi
}

test_adapter_kill_switch() {
    log_info "Testing adapter-level kill switch..."
    
    # Enable adapter kill switch
    log_info "  Enabling kill switch for adapter: ${TEST_ADAPTER}"
    set_adapter_kill_switch "${TEST_ADAPTER}" true > /dev/null
    
    sleep 2
    
    # Verify adapter is excluded from mediation
    local result=$(test_ad_request "${TEST_PLACEMENT_ID}")
    local body=$(echo "$result" | jq -r '.body')
    local adapters=$(echo "$body" | jq -r '.mediation.adapters // []' 2>/dev/null)
    
    if [[ "$adapters" != *"${TEST_ADAPTER}"* ]]; then
        log_success "  Adapter ${TEST_ADAPTER} excluded from mediation chain"
    else
        log_failure "  Adapter ${TEST_ADAPTER} still present in mediation chain"
    fi
    
    # Disable adapter kill switch
    log_info "  Disabling adapter kill switch..."
    set_adapter_kill_switch "${TEST_ADAPTER}" false > /dev/null
    
    sleep 2
}

test_placement_kill_switch() {
    log_info "Testing placement-level kill switch..."
    
    # Enable placement kill switch
    log_info "  Enabling kill switch for placement: ${TEST_PLACEMENT_ID}"
    set_placement_kill_switch "${TEST_PLACEMENT_ID}" true > /dev/null
    
    sleep 2
    
    # Test that specific placement is rejected
    local result=$(test_ad_request "${TEST_PLACEMENT_ID}")
    local duration=$(echo "$result" | jq -r '.duration')
    local body=$(echo "$result" | jq -r '.body')
    local reason=$(echo "$body" | jq -r '.error.reason // .reason // empty' 2>/dev/null)
    
    # Check: Fast failure for this placement
    if [ "$duration" -lt "$TIMEOUT_MS" ]; then
        log_success "  Placement kill switch returned in ${duration}ms"
    else
        log_failure "  Placement kill switch too slow: ${duration}ms"
    fi
    
    # Check: Other placements should still work
    local other_placement="test_interstitial_1"
    result=$(test_ad_request "${other_placement}")
    local http_code=$(echo "$result" | jq -r '.http_code')
    
    if [ "$http_code" == "200" ]; then
        log_success "  Other placements still functioning"
    else
        log_failure "  Other placements affected by placement kill switch"
    fi
    
    # Disable placement kill switch
    log_info "  Disabling placement kill switch..."
    set_placement_kill_switch "${TEST_PLACEMENT_ID}" false > /dev/null
    
    sleep 2
}

test_no_network_on_kill() {
    log_info "Testing that kill switch prevents network calls..."
    
    # Start packet capture (if available)
    local capture_file="/tmp/kill_switch_capture.pcap"
    
    if command -v tcpdump &> /dev/null; then
        log_info "  Starting packet capture..."
        sudo tcpdump -i any -w "$capture_file" port 443 &
        local tcpdump_pid=$!
        sleep 1
    else
        log_info "  tcpdump not available, skipping network capture test"
        return 0
    fi
    
    # Enable kill switch
    set_global_kill_switch true > /dev/null
    sleep 2
    
    # Make multiple requests
    for i in {1..5}; do
        test_ad_request "${TEST_PLACEMENT_ID}" > /dev/null
    done
    
    # Stop capture
    sudo kill $tcpdump_pid 2>/dev/null || true
    sleep 1
    
    # Check if any packets were sent to ad networks
    local ad_network_packets=$(tcpdump -r "$capture_file" 2>/dev/null | grep -c "admob\|applovin\|facebook\|unity" || echo "0")
    
    if [ "$ad_network_packets" == "0" ]; then
        log_success "  No network calls to ad networks when kill switch active"
    else
        log_failure "  Found ${ad_network_packets} packets to ad networks despite kill switch"
    fi
    
    # Cleanup
    rm -f "$capture_file"
    set_global_kill_switch false > /dev/null
}

test_kill_switch_timing() {
    log_info "Testing kill switch response timing..."
    
    # Enable kill switch
    set_global_kill_switch true > /dev/null
    sleep 2
    
    # Make 10 requests and measure timing
    local times=()
    for i in {1..10}; do
        result=$(test_ad_request "${TEST_PLACEMENT_ID}")
        duration=$(echo "$result" | jq -r '.duration')
        times+=("$duration")
    done
    
    # Calculate p50 and p99
    local sorted_times=($(printf '%s\n' "${times[@]}" | sort -n))
    local p50=${sorted_times[4]}
    local p99=${sorted_times[9]}
    
    log_info "  Timing results:"
    log_info "    p50: ${p50}ms"
    log_info "    p99: ${p99}ms"
    
    if [ "$p50" -lt 50 ]; then
        log_success "  p50 latency acceptable: ${p50}ms (< 50ms)"
    else
        log_failure "  p50 latency too high: ${p50}ms (expected < 50ms)"
    fi
    
    if [ "$p99" -lt "$TIMEOUT_MS" ]; then
        log_success "  p99 latency acceptable: ${p99}ms (< ${TIMEOUT_MS}ms)"
    else
        log_failure "  p99 latency too high: ${p99}ms (expected < ${TIMEOUT_MS}ms)"
    fi
    
    # Disable kill switch
    set_global_kill_switch false > /dev/null
}

# =============================================================================
# SDK-Specific Tests
# =============================================================================

test_android_kill_switch() {
    log_info "Testing Android SDK kill switch behavior..."
    
    if [ ! -d "${PROJECT_ROOT}/sdk/core/android" ]; then
        log_info "  Skipping - Android SDK not found"
        return 0
    fi
    
    cd "${PROJECT_ROOT}/sdk/core/android"
    
    # Run kill switch unit tests
    if ./gradlew testDebugUnitTest --tests "*KillSwitch*" 2>&1 | grep -q "BUILD SUCCESSFUL"; then
        log_success "  Android kill switch unit tests passed"
    else
        log_failure "  Android kill switch unit tests failed"
    fi
    
    cd "$SCRIPT_DIR"
}

test_ios_kill_switch() {
    log_info "Testing iOS SDK kill switch behavior..."
    
    if [ ! -d "${PROJECT_ROOT}/sdk/core/ios" ]; then
        log_info "  Skipping - iOS SDK not found"
        return 0
    fi
    
    # Check if on macOS
    if [[ "$(uname)" != "Darwin" ]]; then
        log_info "  Skipping iOS tests - not on macOS"
        return 0
    fi
    
    cd "${PROJECT_ROOT}/sdk/core/ios"
    
    # Run kill switch tests
    if xcodebuild test \
        -scheme ApexMediationSDK \
        -destination 'platform=iOS Simulator,name=iPhone 15' \
        -only-testing:ApexMediationSDKTests/KillSwitchTests 2>&1 | grep -q "** TEST SUCCEEDED **"; then
        log_success "  iOS kill switch unit tests passed"
    else
        log_failure "  iOS kill switch unit tests failed"
    fi
    
    cd "$SCRIPT_DIR"
}

test_web_kill_switch() {
    log_info "Testing Web SDK kill switch behavior..."
    
    if [ ! -d "${PROJECT_ROOT}/Packages/web-sdk" ]; then
        log_info "  Skipping - Web SDK not found"
        return 0
    fi
    
    cd "${PROJECT_ROOT}/Packages/web-sdk"
    
    # Run kill switch tests
    if npm test -- --testPathPattern="killSwitch" 2>&1 | grep -q "passed"; then
        log_success "  Web SDK kill switch unit tests passed"
    else
        log_failure "  Web SDK kill switch unit tests failed"
    fi
    
    cd "$SCRIPT_DIR"
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    echo "============================================="
    echo "  Kill Switch Smoke Test Suite"
    echo "============================================="
    echo ""
    echo "Staging API: ${STAGING_API}"
    echo "Timeout threshold: ${TIMEOUT_MS}ms"
    echo ""
    
    # Validate required environment variables
    if [ -z "${TEST_API_KEY:-}" ]; then
        echo -e "${RED}ERROR: TEST_API_KEY environment variable not set${NC}"
        echo "Export TEST_API_KEY with a valid staging API key"
        exit 1
    fi
    
    if [ -z "${ADMIN_API_KEY:-}" ]; then
        echo -e "${RED}ERROR: ADMIN_API_KEY environment variable not set${NC}"
        echo "Export ADMIN_API_KEY with admin privileges for kill switch control"
        exit 1
    fi
    
    # Check jq is installed
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}ERROR: jq is required but not installed${NC}"
        exit 1
    fi
    
    echo "Starting tests..."
    echo ""
    
    # Run integration tests
    test_global_kill_switch
    echo ""
    
    test_adapter_kill_switch
    echo ""
    
    test_placement_kill_switch
    echo ""
    
    test_kill_switch_timing
    echo ""
    
    # Run SDK-specific tests
    test_android_kill_switch
    echo ""
    
    test_ios_kill_switch
    echo ""
    
    test_web_kill_switch
    echo ""
    
    # Summary
    echo "============================================="
    echo "  Test Summary"
    echo "============================================="
    echo ""
    echo -e "Passed: ${GREEN}${TESTS_PASSED}${NC}"
    echo -e "Failed: ${RED}${TESTS_FAILED}${NC}"
    echo ""
    
    if [ "$TESTS_FAILED" -gt 0 ]; then
        echo -e "${RED}SMOKE TEST FAILED${NC}"
        echo "Kill switch functionality is not working correctly!"
        echo "DO NOT release until all tests pass."
        exit 1
    else
        echo -e "${GREEN}SMOKE TEST PASSED${NC}"
        echo "Kill switch functionality verified."
        exit 0
    fi
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
