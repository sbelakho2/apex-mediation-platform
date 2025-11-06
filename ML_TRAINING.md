A. Core, openly available ad-log datasets (for supervised & pretraining)

TalkingData AdTracking Fraud Detection (Kaggle) — Mobile ad clicks with labels used in a fraud-detection framing. Great for supervised baselines and feature ideation (IP/UA/time patterns, click-to-install proxies, etc.).
Kaggle
+2
Kaggle
+2

iPinYou RTB logs — Public RTB auction/impression/click/conversion logs. No native fraud labels, but perfect to learn normal market dynamics and to generate weak labels via rules (see Section C).
contest.ipinyou.com
+2
wnzhang.net
+2

Criteo Click Logs (1TB) + Criteo Display Challenge — Massive CTR logs. Not fraud-labeled, but invaluable to pretrain embeddings/feature extractors for user-ad-context regularities, then fine-tune on fraud.
Criteo AI Lab
+2
Hugging Face
+2

Avazu CTR dataset — Mobile/web CTR logs for additional pretraining diversity.
Kaggle
+1

Licensing note (important): Kaggle challenge data typically allows research use; confirm commercial-use terms before shipping models trained directly on it. Use these sets to pretrain/feature-engineer, then fine-tune on your own production telemetry and weak labels.

B. Open ecosystem “ground truth” to derive fraud labels & features

These feeds let you manufacture robust weak labels and high-signal features that generalize to mobile in-app traffic:

ads.txt / app-ads.txt / sellers.json

IAB Tech Lab Aggregator / Transparency Center (curated snapshots across the web). Use to validate supply-chain authorization and detect domain/app spoofing and unauthorized resellers.
IAB Tech Lab
+1

IAB ads.txt crawler (open source) to build your own corpus if you don’t have aggregator access. Crawl top apps’ app-ads.txt + sellers.json regularly.
GitHub

Google guidance confirms these files are meant to be publicly crawlable (useful if anyone questions data sourcing).
Google Help
+1

Datacenter, VPN, Tor indicators

Official cloud IP ranges (AWS ip-ranges.json, Google goog.json/cloud.json, Azure Service Tags) → features and allow-/deny heuristics; also useful for negative labels when user agents claim mobile but originate from DC ranges.
Microsoft Learn
+4
AWS Documentation
+4
Amazon Web Services, Inc.
+4

FireHOL “datacenters” list (community aggregated) for extra coverage.
FireHOL IP Lists

Tor exit IPs (Tor bulk exit list / TorBEL) to flag anonymity networks.
check.torproject.org
+1

VPN lists (X4BNet lists_vpn; az0/vpn_ip; and even dynamic sources like VPNGate for test-time enrichment).
GitHub
+2
GitHub
+2

Threat intel / case studies for scenario synthesis

Use VASTFLUX (stacked video in app, spoofing) to design synthetic patterns and detection labels (e.g., multi-creative per slot, battery/data anomalies).
WIRED

C. How to turn these into trainable labels (silver/weak labels)

Supply-chain validity (spoofing checks)
Join your bid/impression logs to crawled app-ads.txt + sellers.json and OpenRTB 2.6 fields (app.bundle, publisher.id, source.ext.schain, imp.*). Label impressions as likely invalid when the seller or intermediary isn’t authorized for that app/bundle. (Use OpenRTB 2.6 and errata for field mapping.)
IAB Tech Lab
+2
GitHub
+2

Network origin anomalies
Flag/label impressions where device.ip/geo resolve to datacenter/VPN/Tor while device.ua claims mobile app execution (or where timezone/geo/carrier conflicts exist). Aggregate per IP/ASN to reduce noise.
FireHOL IP Lists
+1

CTIT/behavioral fingerprints (TalkingData-style)
Build Click-to-Install-Time (CTIT) histograms: ultra-short spikes → click-injection/SDK spoofing; ultra-long tails with low conversion → click spamming. This is a classical signal used by MMPs/fraud vendors.
AppSamurai

ads.txt integrity drift
If an impression’s reseller chain is valid on day D but becomes unauthorized at D+N (or vice versa), mark surrounding windows as suspicious and feed as semi-supervised constraints (Temporal Label Smoothing).

Creative/viewability anomalies (for video/display)
Use Open Measurement (OMSDK) event consistency (you’ll have this from your SDK) vs. auction metadata to weak-label stacked/hidden ads (VASTFLUX-like motifs). For open-data, mimic patterns from public RCAs to synthesize anomalies.
WIRED

D. Model plan that fits a one-founder startup

Phase 1 — Pretrain & rules (2–3 weeks)

Pretrain embeddings/CTR models on Criteo 1TB + Avazu to learn co-occurrence structure for site/app × device × time × features.
Hugging Face
+1

Train a simple supervised classifier on TalkingData to validate pipelines and generate initial “fraudness” features (IP/UA/hour, burstiness, device repetition).
Kaggle

Build a rule engine from B(2)–(3) above to generate weak labels on iPinYou and your own integration logs.
contest.ipinyou.com

Phase 2 — Semi-supervised fusion (2–4 weeks)

Train a student model (GBDT/XGBoost or TabTransformer) on weak labels + small clean set from TalkingData; add graph features (devices/IPs/ASNs/apps bipartite degrees; entropy, Jaccard).

Add an unsupervised detector (Isolation Forest or Deep SVDD) on per-publisher feature vectors to catch novel schemes.

Phase 3 — Productionization (ongoing)

Online inference via rule+model ensemble; stream hard negatives/positives to a feedback topic for continual learning.

Keep data sources fresh (daily ads.txt crawl; weekly cloud IP snapshots; hourly Tor/VPN updates).

E. Concrete feature map (what you can compute from open sources)

Network features: ASN, “is_datacenter”, “is_vpn”, “is_tor”, residential vs hosting, IP reputation overlap counts. (FireHOL + cloud ranges + VPN/Tor lists.)
check.torproject.org
+3
FireHOL IP Lists
+3
AWS Documentation
+3

Supply-chain features: ads.txt/sellers.json presence, mismatch flags, schain depth, #intermediaries, reseller changes over time. (IAB aggregator or your crawler.)
IAB Tech Lab
+1

Device/UA sanity: UA-OS-device model coherence, timezone vs geo mismatch, carrier vs ASN mismatch (use OpenRTB fields reference).
IAB Tech Lab

Temporal/behavioral: CTIT quantiles, click bursts per IP/device, repeated device identifiers across many apps within short windows. (TalkingData patterns + your logs).
Kaggle

Creative/viewability: impossible quartiles for viewability/signals suggesting stacking or hidden ads (mimic VASTFLUX signatures for simulation).
WIRED

F. Evaluation that reflects business impact

Primary: PR-AUC (imbalanced), cost-weighted F1, $-lift (saved spend vs. false positives’ lost revenue).

Latency: p95 inference < 5 ms (score only; heavy checks async).

Robustness: A/B simulate VPN/Tor spikes, DC surges, CTIT skew; check drift monitors on CTIT, ASN mix, app-ads.txt authorization rates.

G. Where each source plugs into your stack

Ingest layer:

Daily snapshots: cloud IP ranges (AWS/GCP/Azure), FireHOL datacenter list, VPN/Tor lists.
check.torproject.org
+5
AWS Documentation
+5
Microsoft
+5

Weekly: ads.txt / app-ads.txt / sellers.json crawls (or IAB aggregator export).
IAB Tech Lab
+1

Periodic: iPinYou logs; one-off/streaming for Criteo/Avazu/TalkingData while prototyping.
Kaggle
+3
contest.ipinyou.com
+3
Hugging Face
+3

Labeler: rules to tag spoofing (unauthorized seller), network anomaly (DC/VPN/Tor), CTIT anomaly.

Trainer: supervised (TalkingData), semi-supervised (weak labels on iPinYou/your logs), unsupervised (anomaly).

Scorer: rule+ML ensemble; rules short-circuit obvious IVT to keep latency low.

H. Nice-to-have extras (still open/usable)

OpenRTB 2.6 guides & errata for field coverage (esp. source.ext.schain, pod bidding in video): useful when deciding what to log for features.
IAB Tech Lab
+2
GitHub
+2


Quick links (by role)

Supervised anchor: TalkingData (fraud challenge).
Kaggle

Pretraining / normal behavior: iPinYou, Criteo 1TB, Avazu.
contest.ipinyou.com
+2
Hugging Face
+2

Supply-chain ground truth: IAB ads.txt/app-ads.txt aggregator & crawler.
IAB Tech Lab
+1

Network ground truth: AWS/GCP/Azure ranges, FireHOL DC list, Tor exits, VPN lists.
GitHub
+5
AWS Documentation
+5
Google Help
+5

Behavioral heuristics: CTIT guidance (install hijacking/click spamming signals).
AppSamurai

Attack pattern inspiration: Vastflux (stacked video fraud) for synthetic tests.
WIRED

Bottom line

There isn’t a single perfect public “mobile ad-fraud dataset.” The winning approach is a composite: pretrain on big open CTR logs, use TalkingData for supervised anchors, and manufacture silver labels from ads.txt/sellers.json, cloud/VPN/Tor sources, and CTIT distributions. This gives you a production-shaped corpus fast—good enough to ship a v1 detector and continuously improve with your own telemetry.