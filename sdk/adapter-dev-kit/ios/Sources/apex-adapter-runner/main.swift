import Foundation
import ApexAdapterDevKit

@main
struct Runner {
    static func main() async {
        let args = CommandLine.arguments
        var adapter = envOrArg("ADAPTER", args: args, key: "--adapter") ?? ""
        let appId = envOrArg("APP_ID", args: args, key: "--appId") ?? "sandbox-app-ios"
        let inter = envOrArg("PLACEMENT_INTER", args: args, key: "--inter") ?? "test_interstitial"
        let reward = envOrArg("PLACEMENT_REWARD", args: args, key: "--reward") ?? "test_rewarded"
        let timeoutSec = Double(envOrArg("TIMEOUT", args: args, key: "--timeout") ?? "10.0") ?? 10.0

        if adapter.isEmpty {
            fputs("Usage: apex-adapter-runner --adapter <name> [--appId <id>] [--inter <placement>] [--reward <placement>] [--timeout <sec>]\n", stderr)
            exit(2)
        }

        let ctx = AdapterTestContext(appId: appId, placementInterstitial: inter, placementRewarded: reward, timeout: timeoutSec)
        let suite = ConformanceSuite()
        do {
            try await suite.runAll(adapterName: adapter, registerAdapter: { /* BYO: register your adapter before calling runner */ }, context: ctx)
            print("Conformance passed for adapter=\(adapter)")
            exit(0)
        } catch {
            fputs("Conformance failed for adapter=\(adapter): \(error)\n", stderr)
            exit(1)
        }
    }

    static func envOrArg(_ envKey: String, args: [String], key: String) -> String? {
        if let v = ProcessInfo.processInfo.environment[envKey], !v.isEmpty { return v }
        if let idx = args.firstIndex(of: key), args.count > idx + 1 { return args[idx + 1] }
        return nil
    }
}
