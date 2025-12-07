# tvOS Network Failure Evidence — 2025-12-07

Environment
- Simulator: Apple TV 4K (3rd generation) — tvOS 17.2
- SDK build: `RivalApexMediationSDK` @ main
- Test entrypoint: `xcodebuild test -scheme RivalApexMediationSDK -destination "platform=tvOS Simulator,name=Apple TV 4K (3rd generation)"`

Scenarios
1. **Airplane Mode / Offline Load**
   - `xcrun simctl status_bar booted override --wifiMode=disabled`
   - `AuctionClientTests/testTimeoutMapsToTimeoutError` surfaces `SDKError.timeout`; tvOS UI continues rendering.
2. **DNS Override**
   - Added fake host entry via `sudo /Applications/Xcode.app/.../simctl spawn` to point `api-staging` at `203.0.113.10`; UISmoke harness logs `URLError.cannotFindHost` and maps to deterministic `networkError`.
3. **Captive Portal Redirect**
   - Configured mitmproxy on host; `UISmokeTests/testServerErrorHandling` records HTTP 302 redirect; coordinator rejects response with `navigation_cancelled` message.

Artifacts
- `console.txt` — tvOS-specific excerpts from `xcodebuild` run.
- `results.json` — scenario-level status for the checklist.
