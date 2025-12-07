# tvOS Sandbox Evidence — 2025-12-07

Environment
- Simulator: Apple TV 4K (3rd generation), tvOS 17.2
- App: `Test Apps/tvos/ApexSandboxCTV-tvOS` (focus-driven SwiftUI shell)
- Command: `xcodebuild -scheme ApexSandboxCTV-tvOS -destination "platform=tvOS Simulator,name=Apple TV 4K (3rd generation)"`

Checklist coverage
1. **Focus loop & Siri Remote navigation** — Recorded traversal across Init/Show buttons, ensuring wrap-around focus and remote key repeat limit.
2. **Menu/Back dismissal** — Long-press `Menu` while ad placeholder visible; logs show `AdPresentationCoordinator show blocked` after dismissal.
3. **Single presenter enforcement** — Trigger double-tap Show; coordinator rejects second request.
4. **Background/Foreground** — `Cmd+Shift+H` to Home, relaunch, verify timers and cached ads release.
5. **Network toggles** — Combined with network-failure work; see sibling folder for logs.

Artifacts
- `console.txt` — excerpts proving presenter guardrails and focus events.
- `video-notes.md` — describes `simctl io` recording plus highlights for reviewers.
