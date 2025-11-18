Platform Unity package (UPM) — Mediation

_Last updated: 2025-11-18_

> **FIX-10 governance:** This README documents Unity SDK scaffolding. For SDK backlog and production readiness, see `docs/Internal/Deployment/PROJECT_STATUS.md` and `docs/Internal/Development/FIXES.md` (FIX-05).

This folder contains a minimal Unity Package scaffolding for the Platform mediation SDK.

What I added:
- `package.json` — UPM manifest
- `Editor/MediationManagerWindow.cs` — EditorWindow scaffold (placements, adapters, payouts placeholders)

Next steps (suggested):
- Add runtime assembly definitions and the runtime API (C# wrapper) under `Runtime/`
- Implement build-time checks (CI step) to enforce adapter size and threading rules
- Implement Editor HUD components (Auction Inspector, Health panel)
- Add UPM publishing pipeline (scoped registry or Git-based package)

How to try locally (in Unity):
1. Open your Unity project (recommended 2020.3+)
2. In Project window, choose Packages -> Add package from disk and point to this package folder
3. Open Platform -> Mediation Manager from the Window menu

Notes:
- This is a minimal scaffold to start Editor tooling and reduce switching friction for Unity studios.
- Do NOT include heavy native libs in the runtime; keep adapters separate and modular.
