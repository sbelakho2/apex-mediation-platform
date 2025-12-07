# Unity Network Emulation Evidence — 2025-12-07

Environment
- Host: macOS 14.2 (Apple Silicon)
- Unity Test Runner: `DOTNET_ROOT=$HOME/.dotnet8 unity -runTests -projectPath sdk/core/unity -testResults ./unity-test-results.xml`
- Harness script: `Assets/Tests/Networking/NetworkEmulationBehaviour.cs` toggling Offline, HighLatency (750ms), CaptivePortal redirect shadows.

Scenarios
1. **Offline toggle** — disables HTTPClient stub; verifies `NetworkingErrorSurfaceTests.OfflineRequestYieldsTimeout` surfaces `Timeout` enum once.
2. **DNS failure** — injects invalid hostname; asserts `NetworkError` classification equals `HostUnreachable`.
3. **Captive portal redirect** — stub returns HTTP 302; Unity bridge raises `NavigationCancelled` and schedules retry with deterministic backoff (250ms, 500ms).

Artifacts
- `console.log` — tail from Unity batchmode run filtered to `NetworkEmulationBehaviour` tag.
- `results.json` — structured outcome summary plus command reference.
