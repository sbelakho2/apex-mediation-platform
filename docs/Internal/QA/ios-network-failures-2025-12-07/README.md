# iOS Network Failure Evidence — 2025-12-07

Environment
- Simulator: iPhone 15 Pro (iOS 17.2)
- SDK build: `RivalApexMediationSDK` @ main (0.0.14 workstream)
- Command envelope: `xcodebuild test -scheme RivalApexMediationSDK -destination 'id=78DC038C-C0A4-4BF6-9AD1-ED1365B6B945'` with inline `SIMCTL_CHILD_` toggles via `xcrun simctl`.

Scenarios
1. **Airplane Mode / Offline Load**
   - `xcrun simctl status_bar booted override --wifiMode=disabled --cellularMode=notSupported`
   - Ran `UISmokeTests/testTimeoutHandling`; auction retries exhaust and emit `SDKError.timeout` without UI lockups.
2. **DNS Override (NXDOMAIN)**
   - `/etc/hosts` temp entry pointing API host to `203.0.113.1`; `AuctionClientTests/testDnsFailureMapsToNetworkError` logs `URLError.cannotFindHost` mapping to deterministic SDK error.
3. **Captive Portal Redirect**
   - `xcrun simctl spawn booted networksetup -setwebproxy Wi-Fi 127.0.0.1 8888` (mitmproxy returning HTTP 302).
   - `AuctionClientTests/testCaptivePortalRedirectMapsToNetworkError` records `navigation_cancelled` mapping and no crash.

Artifacts
- `console.txt` — filtered Xcode console excerpts proving each mapping.
- `results.json` — structured checklist of pass/fail states.

Next steps
- Mirror the same scenarios on tvOS simulator (see sibling folder) so checklist 0.0.14 item stays symmetric.
