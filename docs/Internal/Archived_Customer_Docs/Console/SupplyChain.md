# Supply Chain tab (Console)

Use the Supply Chain tab to see whether each placement is authorized in the ingested app-ads.txt + sellers.json corpus.

## What you see
- Per app: counts of OK, Issues, and Missing domain placements
- Per placement: domain, seller/app/site IDs, and authorization status
- Snapshot metadata: generated time, persisted time, snapshot ID, and the server-side snapshot file location

## Data freshness
- Corpus (app-ads.txt + sellers.json) refreshes every 6 hours.
- Supply chain summary regenerates on page load/refresh and is persisted to both DB and snapshot file; you can request the latest stored snapshot via `latestOnly=true` on the API.

## How it works
- The backend ingests app-ads.txt and sellers.json every 6 hours.
- When you open or refresh the tab, the backend regenerates the summary, saves it to the database and a snapshot file, and returns the latest results.
- If you pass `latestOnly=true` to the API, it returns the most recent stored snapshot without recomputing.

## Tips
- Fix Missing domain first: add a `supplyChain` domain in each placement’s config.
- If Issues appear, verify seller IDs and app/store IDs in your app-ads.txt file.
- Use the “Check a domain” link to debug a specific domain/seller combination.
