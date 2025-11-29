# ApexSandboxUnity

Unity sandbox project (single scene) to exercise the Unity SDK wrapper and native bridges. Intended to run only on emulators/simulators for Android/iOS builds.

Requirements
- Unity 2022.3 LTS (or later)
- Unity Hub (recommended)

Project layout
- Assets/
  - Scenes/ (create `Main.unity` and set as default scene)
  - Scripts/
    - SceneController.cs (stub UI + emulator/simulator guards)
- Packages/manifest.json (minimal dependencies)

Getting started
1. Open Unity Hub → Open → select this `ApexSandboxUnity` folder.
2. Create a scene at `Assets/Scenes/Main.unity`. Add a Canvas with a few Buttons:
   - Initialize
   - Load Interstitial
   - Show Interstitial
   - Load Rewarded
   - Show Rewarded
3. Attach `SceneController` to an empty GameObject and wire button `onClick` to the respective public methods.
4. Enter Play Mode in the Editor to verify the stub flow.

Build targets
- Android: Build to an emulator (Android Virtual Device). On a physical device the app will quit on startup.
- iOS: Build and run to an iOS Simulator. On a physical device the app will quit on startup.

Notes
- Wire the real SDK initialize/load/show calls inside `SceneController` later; right now methods are stubs tied to `sandboxConfig` placeholders.
- Use the same placement IDs and staging endpoints as native test apps.

Related checklist
- See `docs/Internal/Deployment/PRODUCTION_READINESS_CHECKLIST.md` section 0.0.4 Unity Test Project.
