# ApexSandboxAndroid

Android sandbox app for exercising the Mediation SDK end-to-end. Intended for emulator use only.

Requirements
- Android Studio Iguana+ (AGP 8.5+)
- JDK 17

Quick start
1. Open this folder in Android Studio (File → Open → select `ApexSandboxAndroid`).
2. Let Gradle sync. If prompted, allow Android Studio to create the Gradle wrapper.
3. Create an Android emulator (Pixel 6a, API 34).
4. Run configuration: "app" → Run on the emulator.

Emulator-only guard
- The app checks `Build.FINGERPRINT`/`ro.hardware`/`Settings.Secure.ANDROID_ID` heuristics at runtime and terminates if it appears to be a physical device.

Staging configuration
- Configure staging endpoints and placement IDs in `app/src/main/assets/sandbox_config.json` (auto-copied to internal storage on first run).
