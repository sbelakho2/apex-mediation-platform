# iOS SDK Network Retry Policy

**Version**: 1.0  
**Last Updated**: 2024  
**Scope**: Section 3.3 - Network retry behavior and error handling

## Overview

The iOS SDK follows a **single-attempt** network policy with no automatic client-side retries. This aligns with the Android SDK implementation and ensures predictable behavior across platforms.

## Retry Policy Rules

### 1. Server-Side Retries (5xx errors)

**Where**: Backend auction service  
**When**: Transient server failures (500, 502, 503, 504)  
**How**: Backend implements exponential backoff with jitter  
**Client Behavior**: Makes single request, does NOT retry

```swift
// Client makes single auction request
let response = try await configManager.fetchAuction(placementId: "main_banner")

// If server returns 5xx, client propagates error immediately
// No client-side retry logic
switch httpStatusCode {
case 500...599:
    throw SDKError.status_5xx(code: httpStatusCode, message: errorMessage)
}
```

**Rationale**: Server-side retries prevent thundering herd problems and allow backend to apply circuit breakers and rate limiting.

### 2. Client Does NOT Retry 5xx

The iOS SDK does NOT implement automatic retries for 5xx server errors. If the auction service returns 5xx after its own retry logic, the client:

1. Maps status code to `SDKError.status_5xx(code:message:)`
2. Returns error to caller immediately
3. Logs telemetry event for monitoring

**Why**: Avoids duplicate retry logic, respects server-side circuit breakers, prevents cascading failures.

### 3. Client Does NOT Retry 4xx

4xx errors indicate non-transient client errors (invalid request, unauthorized, not found). These are **never** retried.

```swift
// 4xx errors are terminal
case 400...499:
    switch httpStatusCode {
    case 429:
        throw SDKError.status_429(message: "Rate limit exceeded")
    default:
        throw SDKError.networkError(underlying: "HTTP \(httpStatusCode)")
    }
```

**Examples**:
- **400 Bad Request**: Invalid placement ID → propagate `SDKError.invalidPlacement`
- **401 Unauthorized**: Invalid app credentials → propagate error immediately
- **404 Not Found**: Endpoint misconfigured → propagate error immediately
- **429 Too Many Requests**: Rate limit → propagate `SDKError.status_429`, respect Retry-After header

### 4. Timeout Budget Enforcement

**Client-Side Timeout**: Each auction request has a **timeout budget** enforced by the SDK (default: 10 seconds).

```swift
// ConfigManager enforces timeout per request
let timeoutMs = placement.timeoutMs ?? 10000
let task = URLSession.shared.dataTask(with: request)

// Cancel task if timeout exceeded
DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) {
    if task.state == .running {
        task.cancel()
        completion(.failure(SDKError.timeout))
    }
}
```

**Behavior**:
- Timeout triggers `SDKError.timeout`
- No retry on timeout (single attempt)
- Timeout is configurable per placement in OTA config

### 5. Network Connectivity Errors

Network-level failures (DNS resolution, connection refused, SSL errors) are mapped to `SDKError.networkError`.

```swift
// URLSession errors
catch {
    if (error as NSError).domain == NSURLErrorDomain {
        throw SDKError.networkError(underlying: error.localizedDescription)
    }
    throw SDKError.internalError(message: "Unexpected error")
}
```

**Examples**:
- No internet connection → `SDKError.networkError(underlying: "The Internet connection appears to be offline")`
- DNS failure → `SDKError.networkError(underlying: "DNS lookup failed")`
- SSL error → `SDKError.networkError(underlying: "SSL certificate validation failed")`

## Error Taxonomy Mapping

| HTTP Status | SDK Error | Retry? | Explanation |
|-------------|-----------|--------|-------------|
| 200 | Success | N/A | Auction successful |
| 204 | `SDKError.noFill` | No | No ad inventory available |
| 400 | `SDKError.networkError` | No | Malformed request |
| 401 | `SDKError.networkError` | No | Authentication failed |
| 429 | `SDKError.status_429` | No | Rate limit exceeded (respect Retry-After) |
| 500-599 | `SDKError.status_5xx` | No* | Server error (*server retries internally) |
| Timeout | `SDKError.timeout` | No | Request exceeded timeout budget |
| DNS/SSL | `SDKError.networkError` | No | Network connectivity failure |

## Comparison with Android SDK

| Aspect | iOS | Android |
|--------|-----|---------|
| 5xx Retry | No (server-side only) | No (server-side only) |
| 4xx Retry | No | No |
| Timeout | Configurable per placement | Configurable per placement |
| Status 429 | `SDKError.status_429` | `MediationError.STATUS_429` |
| Status 5xx | `SDKError.status_5xx` | `MediationError.STATUS_5XX` |
| No Fill | `SDKError.noFill` | `MediationError.NO_FILL` |

**Parity Status**: ✅ iOS and Android have equivalent retry policies and error taxonomies.

## Telemetry and Observability

All network errors are logged to the telemetry system with:
- Error type (timeout, 5xx, 429, network)
- HTTP status code (if applicable)
- Placement ID
- Timestamp
- Request duration

This enables backend teams to monitor:
- Server 5xx rate (indicates backend health)
- Client timeout rate (indicates network or server latency)
- 429 rate (indicates rate limiting effectiveness)

## Implementation Notes

### ConfigManager (Primary Network Layer)

```swift
// ConfigManager.swift - no retry logic
func loadConfig() async throws -> SDKRemoteConfig {
    let url = config.endpoints.configUrl
    let (data, response) = try await URLSession.shared.data(from: url)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw SDKError.networkError(underlying: "Non-HTTP response")
    }
    
    // Single-attempt, no retry
    switch httpResponse.statusCode {
    case 200:
        return try JSONDecoder().decode(SDKRemoteConfig.self, from: data)
    case 429:
        throw SDKError.status_429(message: "Rate limited")
    case 500...599:
        throw SDKError.status_5xx(code: httpResponse.statusCode, message: "Server error")
    default:
        throw SDKError.networkError(underlying: "HTTP \(httpResponse.statusCode)")
    }
}
```

### Auction Requests

```swift
// Adapter loadAd() calls backend auction
func loadAd(placement: String, adType: AdType, config: [String: Any], 
            completion: @escaping (Result<Ad, AdapterError>) -> Void) {
    
    let auctionRequest = buildAuctionRequest(placement: placement, adType: adType)
    
    // Single attempt with timeout
    let task = URLSession.shared.dataTask(with: auctionRequest) { data, response, error in
        if let error = error {
            completion(.failure(.networkError(underlying: error)))
            return
        }
        
        guard let httpResponse = response as? HTTPURLResponse else {
            completion(.failure(.internalError(message: "Non-HTTP response")))
            return
        }
        
        // Map status codes to errors (no retry)
        let sdkError = SDKError.fromHTTPStatus(
            code: httpResponse.statusCode,
            message: parseErrorMessage(from: data)
        )
        
        switch httpResponse.statusCode {
        case 200:
            let ad = try? JSONDecoder().decode(Ad.self, from: data!)
            completion(.success(ad!))
        default:
            completion(.failure(.sdkError(sdkError)))
        }
    }
    
    task.resume()
}
```

## Testing Guidelines

### Unit Tests

1. **5xx No Retry**: Mock server returning 503, verify single attempt
2. **429 Handling**: Mock 429 response, verify error type
3. **Timeout**: Mock slow server, verify timeout triggers after budget
4. **Network Error**: Simulate offline, verify `networkError` thrown

### Integration Tests

1. **Server-Side Retry**: Backend should retry 503 internally
2. **Circuit Breaker**: After N failures, backend should open circuit breaker
3. **Rate Limiting**: 429 responses should be rare under normal load

### UI Smoke Tests (Section 3.2)

Demo app includes URLProtocol mocking for deterministic scenarios:
- No fill (204)
- Rate limit (429)
- Server error (503)
- Timeout (simulated slow response)

See `UITests/NetworkErrorTests.swift` for implementation.

## Future Considerations

### Potential Retry Scenarios (Not Implemented)

If future requirements dictate client-side retries:

1. **Exponential Backoff**: Use `Task.sleep()` with jitter
2. **Max Attempts**: Limit to 3 attempts max
3. **Idempotency**: Ensure auction requests are idempotent (use request IDs)
4. **Circuit Breaker**: Client-side circuit breaker after N consecutive failures

**Current Decision**: Keep client simple (single-attempt), leverage server-side retry logic.

## References

- **Android SDK Retry Policy**: `docs/Android/NetworkRetryPolicy.md`
- **Backend Retry Logic**: `backend/auction/internal/retry.go`
- **Error Taxonomy**: `docs/iOS/ErrorHandling.md`
- **Telemetry Events**: `docs/iOS/TelemetryGuide.md`

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2024 | 1.0 | Initial iOS retry policy documentation (Section 3.3) |
