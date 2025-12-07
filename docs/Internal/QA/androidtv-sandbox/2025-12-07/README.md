# Android TV / CTV Sandbox Evidence — 2025-12-07

Environment
- Device: Android TV Emulator (Android 14 for TV, 1080p) + Fire TV Stick 4K Max (hardware)
- App: `Test Apps/AndroidTV/ApexSandboxCTV-Android`
- Command: `./gradlew :TestApps:AndroidTV:connectedDebugAndroidTest`

Checklist coverage
1. **Safe-area & overscan** — Verified using 1080p + 4K layouts; screenshots captured for banner safe areas.
2. **Remote spam tolerance** — Held OK button for 3 seconds; show queue remained single-entry.
3. **Back/Home lifecycle** — Pressed Home, launched YouTube, returned; `AdPresentationCoordinator` resumed pending loads.
4. **Network flip** — Swapped between Ethernet and Wi-Fi mid-load; logs detail retry/resume.

Artifacts
- `screenshots.txt` — references to stored captures.
- `logcat.txt` — filtered `platform=android_tv` entries.
