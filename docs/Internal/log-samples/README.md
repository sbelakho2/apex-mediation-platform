# Sanitized Log Samples

The runtime `logs/` directory is intentionally `gitignore`d so raw JSONL exports never leave the workstation. This folder provides the **only** committed examples and stays safe to share publicly.

- `error.sample.log` contains a single redacted entry that documents the JSON schema our ingestion stack expects.
- Add new samples here whenever the schema changes. Never store multi-line stack traces or tenant identifiers—use placeholders instead.

To capture real logs:
1. Run the appropriate capture script (e.g., `scripts/capture-console.sh`) and write output to a temporary directory.
2. Upload the archive to your secure log bucket per `monitoring/README.md`.
3. If you need to document a new field, sanitize a **single** entry and update `error.sample.log` in this folder.
