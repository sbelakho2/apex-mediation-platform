# ML Training Guide

This guide covers data sources, model training, and deployment strategies for ML-based fraud detection and optimization models.

## Table of Contents

1. [Data Sources](#data-sources)
2. [GPU Training Setup](#gpu-training-setup)
3. [CPU Deployment & Optimization](#cpu-deployment--optimization)
4. [Model Training Pipeline](#model-training-pipeline)
5. [Edge Deployment](#edge-deployment)

---

## Data Sources

### A. Core, openly available ad-log datasets (for supervised & pretraining)

TalkingData AdTracking Fraud Detection (Kaggle) — Mobile ad clicks with labels used in a fraud-detection framing. Great for supervised baselines and feature ideation (IP/UA/time patterns, click-to-install proxies, etc.).
Kaggle
+2
Kaggle
+2

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

---

## Model Training Pipeline

See Phase 1-3 above for detailed training workflow (pretrain, semi-supervised fusion, productionization).

### E. Concrete feature map (what you can compute from open sources)

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

---

## Edge Deployment

### Mobile SDK Integration

Models exported to ONNX can run on-device for ultra-low latency fraud detection.

#### Android Integration

```kotlin
// build.gradle
dependencies {
    implementation 'com.microsoft.onnxruntime:onnxruntime-android:1.16.3'
}

// FraudDetector.kt
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession

class FraudDetector(context: Context) {
    private val env = OrtEnvironment.getEnvironment()
    private val session: OrtSession
    
    init {
        val modelBytes = context.assets.open("fraud_model.onnx").readBytes()
        session = env.createSession(modelBytes)
    }
    
    fun predict(features: FloatArray): Float {
        val shape = longArrayOf(1, features.size.toLong())
        val tensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(features), shape)
        
        val output = session.run(mapOf(session.inputNames.first() to tensor))
        val result = output[0].value as Array<FloatArray>
        
        return result[0][1] // fraud probability
    }
}

// Usage
val detector = FraudDetector(context)
val fraudScore = detector.predict(floatArrayOf(
    impressions24h, clicks24h, ctr, ipEntropy, userAgentFeatures, timeFeatures
))
```

#### iOS Integration

```swift
// Package.swift or CocoaPods
dependencies: [
    .package(url: "https://github.com/microsoft/onnxruntime-swift", from: "1.16.3")
]

// FraudDetector.swift
import onnxruntime_swift

class FraudDetector {
    private let session: ORTSession
    
    init() throws {
        let env = try ORTEnv(loggingLevel: .warning)
        let modelPath = Bundle.main.path(forResource: "fraud_model", ofType: "onnx")!
        session = try ORTSession(env: env, modelPath: modelPath, sessionOptions: nil)
    }
    
    func predict(features: [Float]) throws -> Float {
        let shape: [NSNumber] = [1, features.count as NSNumber]
        let inputTensor = try ORTValue(
            tensorData: NSMutableData(bytes: features, length: features.count * 4),
            elementType: .float,
            shape: shape
        )
        
        let outputs = try session.run(
            withInputs: ["input": inputTensor],
            outputNames: ["output"],
            runOptions: nil
        )
        
        guard let outputTensor = outputs["output"],
              let outputData = try? outputTensor.tensorData() as Data else {
            throw FraudDetectorError.inferenceError
        }
        
        let fraudScore = outputData.withUnsafeBytes { $0.load(fromByteOffset: 4, as: Float.self) }
        return fraudScore
    }
}

// Usage
let detector = try FraudDetector()
let fraudScore = try detector.predict(features: [
    impressions24h, clicks24h, ctr, ipEntropy, userAgentFeatures, timeFeatures
])
```

### Performance Targets

- **Latency:** <10ms p95 on mid-range devices (iPhone 11, Pixel 5)
- **Model Size:** <5MB for on-device storage
- **Battery Impact:** <1% drain per 1000 predictions
- **Memory:** <50MB peak during inference

### Optimization Tips

1. **Quantize to int8:** Reduces model size by 75% with <1% accuracy loss
2. **Prune unused operations:** Remove unnecessary graph nodes
3. **Use CoreML/NNAPI:** Hardware acceleration on Apple/Android devices
4. **Batch predictions:** Process multiple events together when possible
5. **Cache embeddings:** Reuse computed features across requests

### Testing on Device

```bash
# Android - use ADB to profile
adb shell am start -n com.rival.sdk/FraudDetectorBenchmark
adb logcat | grep "Inference latency"

# iOS - use Instruments
xcodebuild test -scheme RivalSDK \
  -destination 'platform=iOS,name=iPhone 15' \
  -only-testing:RivalSDKTests/FraudDetectorPerformanceTests
```

---

## Quick Reference Links

### H. Nice-to-have extras (still open/usable)

OpenRTB 2.6 guides & errata for field coverage (esp. source.ext.schain, pod bidding in video): useful when deciding what to log for features.
IAB Tech Lab
+2
GitHub
+2

### Links by Role

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

There isn't a single perfect public "mobile ad-fraud dataset." The winning approach is a composite: pretrain on big open CTR logs, use TalkingData for supervised anchors, and manufacture silver labels from ads.txt/sellers.json, cloud/VPN/Tor sources, and CTIT distributions. This gives you a production-shaped corpus fast—good enough to ship a v1 detector and continuously improve with your own telemetry.

---

## GPU Training Setup

### Hardware Requirements

**Minimum:**
- 1x NVIDIA GPU with 8GB VRAM (e.g., RTX 3070, Tesla T4)
- 16GB system RAM
- CUDA 11.8 or higher

**Recommended:**
- 2-4x NVIDIA GPUs with 16GB+ VRAM (e.g., A100, RTX 4090)
- 64GB system RAM
- NVMe SSD for fast data loading

### CUDA Installation

```bash
# Check CUDA availability
nvidia-smi

# Install CUDA toolkit (Ubuntu/Debian)
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-ubuntu2204.pin
sudo mv cuda-ubuntu2204.pin /etc/apt/preferences.d/cuda-repository-pin-600
wget https://developer.download.nvidia.com/compute/cuda/12.3.0/local_installers/cuda-repo-ubuntu2204-12-3-local_12.3.0-545.23.06-1_amd64.deb
sudo dpkg -i cuda-repo-ubuntu2204-12-3-local_12.3.0-545.23.06-1_amd64.deb
sudo cp /var/cuda-repo-ubuntu2204-12-3-local/cuda-*-keyring.gpg /usr/share/keyrings/
sudo apt-get update
sudo apt-get -y install cuda

# Verify installation
nvcc --version
```

### PyTorch GPU Setup

```bash
# Install PyTorch with CUDA support
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Verify GPU detection
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'GPU count: {torch.cuda.device_count()}')"
```

### Multi-GPU Training

**DistributedDataParallel (DDP):**

```python
import torch
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.utils.data.distributed import DistributedSampler

def setup_distributed():
    """Initialize distributed training"""
    dist.init_process_group(backend='nccl')
    torch.cuda.set_device(int(os.environ['LOCAL_RANK']))

def train_multi_gpu(model, train_loader, epochs=50):
    """Multi-GPU training with DDP"""
    setup_distributed()
    
    # Wrap model in DDP
    model = model.to(torch.cuda.current_device())
    model = DDP(model, device_ids=[torch.cuda.current_device()])
    
    # Use DistributedSampler
    train_sampler = DistributedSampler(train_dataset)
    train_loader = DataLoader(train_dataset, sampler=train_sampler, batch_size=256)
    
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
    
    for epoch in range(epochs):
        train_sampler.set_epoch(epoch)
        model.train()
        
        for batch in train_loader:
            inputs, targets = batch
            inputs = inputs.to(torch.cuda.current_device())
            targets = targets.to(torch.cuda.current_device())
            
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

# Launch training
# torchrun --nproc_per_node=4 train.py
```

**Launch command:**
```bash
torchrun --nproc_per_node=4 --master_port=29500 ML/scripts/train_fraud_detector.py \
  --data-dir data/training/fraud \
  --output-dir models/fraud/1.1.0 \
  --epochs 50 \
  --batch-size 1024
```

### Mixed Precision Training

Reduce memory usage and speed up training with automatic mixed precision (AMP):

```python
from torch.cuda.amp import autocast, GradScaler

scaler = GradScaler()

for epoch in range(epochs):
    for batch in train_loader:
        inputs, targets = batch
        inputs = inputs.cuda()
        targets = targets.cuda()
        
        optimizer.zero_grad()
        
        # Forward pass with autocast
        with autocast():
            outputs = model(inputs)
            loss = criterion(outputs, targets)
        
        # Backward pass with gradient scaling
        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
```

**Benefits:**
- 2-3x faster training
- 40-50% memory reduction
- Minimal accuracy loss (<0.5%)

### GPU Memory Optimization

**Gradient Checkpointing:**
```python
import torch.utils.checkpoint as checkpoint

class FraudDetectorCheckpointed(nn.Module):
    def forward(self, x):
        # Trade compute for memory
        return checkpoint.checkpoint(self.layers, x)
```

**Gradient Accumulation:**
```python
accumulation_steps = 4
optimizer.zero_grad()

for i, batch in enumerate(train_loader):
    loss = model(batch) / accumulation_steps
    loss.backward()
    
    if (i + 1) % accumulation_steps == 0:
        optimizer.step()
        optimizer.zero_grad()
```

### Monitoring GPU Usage

```bash
# Watch GPU utilization
watch -n 1 nvidia-smi

# Log GPU metrics to TensorBoard
tensorboard --logdir runs/ --bind_all

# Monitor with Prometheus (add to training script)
from prometheus_client import Gauge
gpu_memory_used = Gauge('gpu_memory_used_bytes', 'GPU memory usage', ['device'])

for i in range(torch.cuda.device_count()):
    mem = torch.cuda.memory_allocated(i)
    gpu_memory_used.labels(device=i).set(mem)
```

---

## CPU Deployment & Optimization

Models trained on GPU must be optimized for CPU inference in production (edge devices, Kubernetes without GPU).

### Model Export Formats

#### ONNX Export

```python
import torch.onnx

# Export trained model to ONNX
model.eval()
dummy_input = torch.randn(1, input_size)

torch.onnx.export(
    model,
    dummy_input,
    "models/fraud/1.1.0/model.onnx",
    export_params=True,
    opset_version=14,
    do_constant_folding=True,
    input_names=['input'],
    output_names=['output'],
    dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
)
```

**Verify ONNX model:**
```python
import onnx
import onnxruntime as ort

# Check model
onnx_model = onnx.load("models/fraud/1.1.0/model.onnx")
onnx.checker.check_model(onnx_model)

# Test inference
session = ort.InferenceSession("models/fraud/1.1.0/model.onnx")
inputs = {session.get_inputs()[0].name: dummy_input.numpy()}
outputs = session.run(None, inputs)
```

#### TorchScript Export

```python
# Trace model
scripted_model = torch.jit.trace(model, dummy_input)
scripted_model.save("models/fraud/1.1.0/model.pt")

# Or use script mode for control flow
scripted_model = torch.jit.script(model)
scripted_model.save("models/fraud/1.1.0/model.pt")
```

### Quantization

Reduce model size and inference latency with quantization.

#### Dynamic Quantization

```python
import torch.quantization

# Post-training dynamic quantization (easiest)
quantized_model = torch.quantization.quantize_dynamic(
    model,
    {torch.nn.Linear, torch.nn.LSTM},
    dtype=torch.qint8
)

torch.jit.save(torch.jit.script(quantized_model), "models/fraud/1.1.0/model_quantized.pt")
```

**Typical results:**
- Model size: 75% reduction (15.3 MB → 4 MB)
- Latency: 2-3x faster
- Accuracy drop: <1%

#### Static Quantization

```python
# Calibration step
model.qconfig = torch.quantization.get_default_qconfig('fbgemm')
model_prepared = torch.quantization.prepare(model)

# Run calibration data through model
with torch.no_grad():
    for batch in calibration_loader:
        model_prepared(batch)

# Convert to quantized model
model_quantized = torch.quantization.convert(model_prepared)
```

#### Quantization-Aware Training (QAT)

```python
# Train with fake quantization
model.qconfig = torch.quantization.get_default_qat_qconfig('fbgemm')
model_prepared = torch.quantization.prepare_qat(model)

# Train normally
for epoch in range(epochs):
    for batch in train_loader:
        loss = train_step(model_prepared, batch)

# Convert to quantized
model_quantized = torch.quantization.convert(model_prepared.eval())
```

**Best accuracy preservation:**
- QAT > Static > Dynamic
- Use QAT for models where <0.5% accuracy drop is critical

### Validation After Export

```python
import numpy as np
from sklearn.metrics import accuracy_score, roc_auc_score

def validate_exported_model(original_model, exported_path, test_loader):
    """Compare original vs exported model performance"""
    
    # ONNX inference
    session = ort.InferenceSession(exported_path)
    
    original_preds = []
    exported_preds = []
    labels = []
    
    with torch.no_grad():
        for batch, targets in test_loader:
            # Original model
            orig_output = original_model(batch).numpy()
            
            # Exported model
            inputs = {session.get_inputs()[0].name: batch.numpy()}
            exp_output = session.run(None, inputs)[0]
            
            original_preds.extend(orig_output)
            exported_preds.extend(exp_output)
            labels.extend(targets.numpy())
    
    # Calculate metrics
    orig_acc = accuracy_score(labels, np.argmax(original_preds, axis=1))
    exp_acc = accuracy_score(labels, np.argmax(exported_preds, axis=1))
    
    orig_auc = roc_auc_score(labels, original_preds[:, 1])
    exp_auc = roc_auc_score(labels, exported_preds[:, 1])
    
    print(f"Original - Accuracy: {orig_acc:.4f}, AUC: {orig_auc:.4f}")
    print(f"Exported - Accuracy: {exp_acc:.4f}, AUC: {exp_auc:.4f}")
    print(f"Accuracy drop: {orig_acc - exp_acc:.4f} ({(orig_acc - exp_acc) / orig_acc * 100:.2f}%)")
    
    # Fail if accuracy drops >2%
    assert (orig_acc - exp_acc) < 0.02, "Accuracy degradation too high"

# Run validation
validate_exported_model(model, "models/fraud/1.1.0/model.onnx", test_loader)
```

### Performance Benchmarking

```python
import time

def benchmark_model(model_path, num_iterations=1000):
    """Measure inference latency"""
    session = ort.InferenceSession(model_path)
    dummy_input = np.random.randn(1, input_size).astype(np.float32)
    inputs = {session.get_inputs()[0].name: dummy_input}
    
    # Warmup
    for _ in range(100):
        session.run(None, inputs)
    
    # Benchmark
    latencies = []
    for _ in range(num_iterations):
        start = time.perf_counter()
        session.run(None, inputs)
        latencies.append((time.perf_counter() - start) * 1000)
    
    print(f"p50: {np.percentile(latencies, 50):.2f} ms")
    print(f"p95: {np.percentile(latencies, 95):.2f} ms")
    print(f"p99: {np.percentile(latencies, 99):.2f} ms")

benchmark_model("models/fraud/1.1.0/model.onnx")
# Expected: p50 < 5ms, p95 < 12ms, p99 < 25ms
```

---

## Model Training Pipeline