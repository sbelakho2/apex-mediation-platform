import Foundation

/**
 * Circuit Breaker implementation for fault tolerance
 *
 * Prevents cascading failures by stopping requests to failing services
 */
public final class CircuitBreaker {
    
    private enum State {
        case closed
        case open
        case halfOpen
    }
    
    private let failureThreshold: Int
    private let resetTimeoutMs: Int64
    private let halfOpenMaxAttempts: Int
    
    private var state: State = .closed
    private var failureCount: Int = 0
    private var successCount: Int = 0
    private var lastFailureTime: Int64 = 0
    
    private let lock = NSLock()
    
    public init(
        failureThreshold: Int = 5,
        resetTimeoutMs: Int64 = 60000,
        halfOpenMaxAttempts: Int = 3
    ) {
        self.failureThreshold = failureThreshold
        self.resetTimeoutMs = resetTimeoutMs
        self.halfOpenMaxAttempts = halfOpenMaxAttempts
    }
    
    /**
     * Execute action with circuit breaker protection
     */
    public func execute<T>(_ action: () throws -> T) -> T? {
        lock.lock()
        defer { lock.unlock() }
        
        switch state {
        case .open:
            if shouldAttemptReset() {
                state = .halfOpen
                successCount = 0
            } else {
                return nil
            }
            
        case .halfOpen:
            if successCount >= halfOpenMaxAttempts {
                state = .open
                return nil
            }
            
        case .closed:
            break
        }
        
        do {
            let result = try action()
            onSuccess()
            return result
        } catch {
            onFailure()
            return nil
        }
    }
    
    private func onSuccess() {
        switch state {
        case .halfOpen:
            successCount += 1
            if successCount >= halfOpenMaxAttempts {
                state = .closed
                failureCount = 0
            }
            
        case .closed:
            failureCount = 0
            
        case .open:
            break
        }
    }
    
    private func onFailure() {
        lastFailureTime = Int64(Date().timeIntervalSince1970 * 1000)
        
        switch state {
        case .halfOpen:
            state = .open
            successCount = 0
            
        case .closed:
            failureCount += 1
            if failureCount >= failureThreshold {
                state = .open
            }
            
        case .open:
            break
        }
    }
    
    private func shouldAttemptReset() -> Bool {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        return now - lastFailureTime >= resetTimeoutMs
    }
    
    public var isOpen: Bool {
        lock.lock()
        defer { lock.unlock() }
        return state == .open
    }
    
    public func reset() {
        lock.lock()
        defer { lock.unlock() }
        
        state = .closed
        failureCount = 0
        successCount = 0
        lastFailureTime = 0
    }
}

/**
 * Timeout wrapper for operations
 */
public final class TimeoutEnforcer {
    private let timeoutMs: Int
    
    public init(timeoutMs: Int) {
        self.timeoutMs = timeoutMs
    }
    
    public func execute<T>(_ action: @escaping () throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask {
                try action()
            }
            
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(self.timeoutMs) * 1_000_000)
                throw TimeoutError()
            }
            
            guard let result = try await group.next() else {
                throw TimeoutError()
            }
            
            group.cancelAll()
            return result
        }
    }
}

public struct TimeoutError: Error {
    public let message = "Operation timed out"
}

/**
 * Rate limiter for API calls
 */
public final class RateLimiter {
    private let maxRequestsPerSecond: Int
    private var timestamps: [Int64] = []
    private let lock = NSLock()
    
    public init(maxRequestsPerSecond: Int) {
        self.maxRequestsPerSecond = maxRequestsPerSecond
    }
    
    public func acquire() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        
        // Remove timestamps older than 1 second
        timestamps.removeAll { $0 < now - 1000 }
        
        if timestamps.count < maxRequestsPerSecond {
            timestamps.append(now)
            return true
        }
        
        return false
    }
}
