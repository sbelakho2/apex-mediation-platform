# Releasing the Unity UPM package

This document describes how to cut a Unity SDK release, produce a UPM tarball, and attach it to a GitHub Release.

## Versioning

- Follow SemVer: MAJOR.MINOR.PATCH (e.g., `0.2.1`).
- Update the `version` field in `Packages/com.rivalapexmediation.sdk/package.json`.

## Tag naming

- Create a Git tag with the following pattern:
  - `sdk-unity-vX.Y.Z` (example: `sdk-unity-v0.2.1`).
- Push the tag to GitHub.

## CI automation

The workflow `.github/workflows/unity-ci.yml` will:

1. Run the Unity test matrix on pull requests and pushes to main/master.
2. On tags that match `sdk-unity-v*`, package the UPM folder and attach it to the matching GitHub Release.

Artifacts:

- `com.rivalapexmediation.sdk-X.Y.Z.tgz` — the UPM tarball

## Manual packaging (optional)

If needed, you can manually create the tarball:

```bash
VERSION=0.2.1
PKG_DIR=Packages/com.rivalapexmediation.sdk
tar --exclude-vcs -czf com.rivalapexmediation.sdk-${VERSION}.tgz -C "$PKG_DIR" .
```

## Importing the package

Consumers can:

1. Download `com.rivalapexmediation.sdk-X.Y.Z.tgz` from the GitHub Release, then in Unity:
   - Window → Package Manager → Add package from tarball...
2. Or add a scoped registry if you host a registry; otherwise, use the tarball method.

## Checklist before tagging

- [ ] `package.json` has correct `name`, `version`, `displayName`, `description`, `unity` minimum version.
- [ ] `Runtime/` and `Editor/` asmdefs exist and compile against targeted platforms.
- [ ] Samples (if any) updated and compile.
- [ ] Changelog updated and release notes prepared.
