## tvOS Focus Loop Recording

- Recorded via `xcrun simctl io booted recordVideo tvos-focus-loop.mp4` (00:42) while walking Init → Load/Show Interstitial → Rewarded buttons.
- Highlights:
  1. Remote D-Pad repeats wrap focus to first row without skipping buttons.
  2. Duplicate Show tap renders the inline toast "Presenter busy" (timestamp 00:16).
  3. Long-press Menu at 00:24 dismisses placeholder; console log line 7 matches.
- Video stored outside repo to avoid binary bloat; reference path: `~/Videos/tvos-focus-loop-2025-12-07.mp4`.
