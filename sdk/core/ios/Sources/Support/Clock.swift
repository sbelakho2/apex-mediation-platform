import Foundation

/// Abstraction over time sources to enable monotonic timing and test control.
public protocol ClockProtocol: Sendable {
    /// Wall-clock now.
    func now() -> Date
    /// Wall-clock milliseconds since epoch.
    func nowMillis() -> Int64
    /// Monotonic milliseconds since boot.
    func monotonicMillis() -> Int64
    /// Monotonic seconds since boot.
    func monotonicSeconds() -> TimeInterval
}

/// Default system clock using Foundation wall time and process uptime for monotonic duration.
public final class SystemClock: ClockProtocol {
    public init() {}
    public func now() -> Date { Date() }
    public func nowMillis() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
    public func monotonicMillis() -> Int64 { Int64(ProcessInfo.processInfo.systemUptime * 1000) }
    public func monotonicSeconds() -> TimeInterval { ProcessInfo.processInfo.systemUptime }
}

/// Shared clock instance, overrideable in tests.
public enum Clock {
    public static var shared: ClockProtocol = SystemClock()
}
