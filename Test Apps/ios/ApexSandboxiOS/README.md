# ApexSandboxiOS

iOS sandbox app (Simulator only) for exercising Mediation SDK flows.

Requirements
- Xcode 16+
- XcodeGen (`brew install xcodegen`)

Quick start
1. `cd Test Apps/ios/ApexSandboxiOS`
2. `xcodegen generate`
3. Open `ApexSandboxiOS.xcodeproj` in Xcode.
4. Select an iOS Simulator (e.g., iPhone 15) and Run.

Notes
- The app terminates immediately if built for a physical device; it is Simulator-only by design (see `#if targetEnvironment(simulator)`).
- Configure staging endpoints and placement IDs in `Sources/SandboxConfig.json`.
