Data Manifests and Preflight Validation (FIX-06)

Overview
- This repository uses explicit manifest JSON files to describe dataset/enrichment inputs. Manifests enable deterministic pipelines by recording: source, path (local or URL), format, expected columns, optional row count, checksum (sha256), version, and updated_at.
- The tools in ML/scripts/manifest_tools.py provide: compute-checksum, validate, refresh, and scan commands.

Manifest schema (JSON)
- Required: source (string), path (string), format (csv|jsonl|parquet|tsv|json)
- Optional: columns (string[]), row_count (number), sha256 (string), version (string), updated_at (ISO8601 string)

Notes
- For local files, strict validation requires the file to exist and sha256 to match.
- For http(s) paths, checksums are not computed by the CLI and may be omitted.

CLI quick reference (run from repo root)
- Compute checksum: python ML/scripts/manifest_tools.py compute-checksum data/enrichment/raw/aws-ip-ranges.json
- Validate manifest (strict): python ML/scripts/manifest_tools.py validate data/enrichment/aws_ip_ranges_manifest.json
- Validate allowing missing checksum: python ML/scripts/manifest_tools.py validate data/enrichment/aws_ip_ranges_manifest.json --allow-missing-checksum
- Refresh (compute sha256, set version and updated_at): python ML/scripts/manifest_tools.py refresh data/enrichment/aws_ip_ranges_manifest.json --version v2025-11-16
- Scan directory: python ML/scripts/manifest_tools.py scan data/enrichment

Script integration (preflight flags)
- Fetch enrichment datasets: python ML/scripts/fetch_enrichment.py --output data/enrichment --validate-manifests
  (Scans the output directory and validates found manifests before fetching.)
- Build IP enrichment bundle:
  python ML/scripts/build_ip_enrichment.py \
    --abuseipdb data/enrichment/raw/abuseipdb.csv \
    --tor data/enrichment/raw/tor-exits.txt \
    --cloud data/enrichment/raw/aws-ip-ranges.json \
    --output-dir data/enrichment/cache \
    --validate-manifests \
    --manifest-dir data/enrichment
  (Validates manifests in the given directory; if omitted, looks for *manifest.json adjacent to inputs.)

Validation CLI (dataset schemas)
- Validate a dataset sample against canonical schemas and emit diagnostics JSON:
  - CSV:
    - python ML/scripts/validate_dataset.py --schema fraud --format csv --path data/sample.csv --limit 10000 --report artifacts/sample.csv.validation.json
  - Parquet:
    - python ML/scripts/validate_dataset.py --schema fraud --format parquet --path data/features.parquet --limit 20000 --report artifacts/features.validation.json
  - JSONL:
    - python ML/scripts/validate_dataset.py --schema fraud --format jsonl --path data/events.jsonl --limit 50000 --report artifacts/events.validation.json

Feature engineering & training with validation
- Feature engineering (streaming) with input/output validation:
  - python ML/scripts/feature_engineering.py --input data/events.parquet --out-dir .out --stream --input-format parquet --validate-in --validate-out --validate-limit 10000
- Training (bounded-memory) with preflight features validation:
  - python ML/scripts/train_supervised_logreg.py --features .out/features.parquet --row-limit 100000 --input-format parquet --out-dir .model --validate-features --validate-limit 10000

Best practices
- Keep manifest files next to their data under data/enrichment/ and data/weak-supervision/.
- Prefer names like *_manifest.json or *.manifest.json for easy discovery.
- Refresh manifests whenever the underlying file changes.
- Avoid duplicates: models/* should be the single source of truth for model-bound manifests (CI check planned in FIX-06).
  - Use ML/scripts/check_manifests.py or the ML PR workflow to enforce the allowed locations (models/**, data/enrichment/**, data/weak-supervision/**).
