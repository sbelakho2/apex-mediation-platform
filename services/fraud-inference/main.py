"""Fraud inference service with authenticated scoring and RED metrics."""

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import onnxruntime as ort
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Prometheus metrics (RED: Rate, Errors, Duration)
REQUEST_COUNT = Counter(
    "fraud_inference_requests_total",
    "Total fraud inference requests",
    ["endpoint", "status"],
)
REQUEST_DURATION = Histogram(
    "fraud_inference_duration_seconds",
    "Fraud inference request duration",
    ["endpoint"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)
ERROR_COUNT = Counter(
    "fraud_inference_errors_total",
    "Total fraud inference errors",
    ["endpoint", "error_type"],
)


class FraudFeatures(BaseModel):
    """Input features for fraud detection."""
    feature_1: float = Field(..., description="Network entropy")
    feature_2: float = Field(..., description="Click-to-install time")
    feature_3: float = Field(..., description="IP reputation score")
    # Add more features as needed


class FraudScore(BaseModel):
    """Fraud detection response."""
    fraud_score: float = Field(..., ge=0.0, le=1.0, description="Fraud probability")
    is_fraud: bool = Field(..., description="Binary fraud decision")
    threshold: float = Field(..., description="Decision threshold used")
    latency_ms: float = Field(..., description="Inference latency in milliseconds")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    model_loaded: bool
    model_version: Optional[str] = None
    uptime_seconds: float


class ModelState:
    """Global model state."""
    model: Optional[ort.InferenceSession] = None
    threshold: float = 0.5
    feature_names: List[str] = []
    model_version: str = "unknown"
    start_time: float = time.time()
    scaler: Optional[Any] = None


state = ModelState()

ALLOW_MODEL_MOCKS = os.getenv("ALLOW_MODEL_MOCKS", "false").lower() in {"1", "true", "yes"}
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE")
TENANT_HEADER = os.getenv("INFERENCE_TENANT_HEADER", "X-Publisher-Id")
ALLOWED_ROLES = {
    role.strip()
    for role in os.getenv("INFERENCE_ALLOWED_ROLES", "admin,publisher,readonly").split(",")
    if role.strip()
}
RATE_LIMIT_MAX_REQUESTS = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "300"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))


class RateLimiter:
    """Simple in-memory sliding-window rate limiter keyed by tenant."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: Dict[str, deque] = defaultdict(deque)
        self._lock = Lock()

    def hit(self, key: str) -> None:
        if self.max_requests <= 0:
            return

        now = time.time()
        window_floor = now - self.window_seconds

        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] < window_floor:
                bucket.popleft()

            if len(bucket) >= self.max_requests:
                raise HTTPException(
                    status_code=429,
                    detail="Rate limit exceeded",
                    headers={"Retry-After": str(self.window_seconds)},
                )

            bucket.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


RATE_LIMITER = RateLimiter(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS)


class AuthContext(BaseModel):
    user_id: str
    publisher_id: str
    email: str
    role: Optional[str] = None


def _base64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def decode_jwt_token(token: str) -> Dict[str, Any]:
    if not JWT_SECRET:
        logger.error("JWT_SECRET not configured for fraud inference service")
        raise HTTPException(status_code=500, detail="Authentication configuration error")

    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Invalid token format")

    header_segment, payload_segment, signature_segment = parts

    try:
        header = json.loads(_base64url_decode(header_segment))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="Invalid token header") from exc

    if header.get("alg") != JWT_ALGORITHM:
        raise HTTPException(status_code=401, detail="Unsupported JWT algorithm")

    signing_input = f"{header_segment}.{payload_segment}".encode("ascii")
    expected_signature = hmac.new(
        JWT_SECRET.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()

    try:
        provided_signature = _base64url_decode(signature_segment)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="Invalid token signature") from exc

    if not hmac.compare_digest(expected_signature, provided_signature):
        raise HTTPException(status_code=401, detail="Invalid token signature")

    try:
        payload: Dict[str, Any] = json.loads(_base64url_decode(payload_segment))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="Invalid token payload") from exc

    expires_at = payload.get("exp")
    if expires_at is not None and time.time() >= float(expires_at):
        raise HTTPException(status_code=401, detail="Token expired")

    if JWT_AUDIENCE:
        audience_claim = payload.get("aud")
        audiences = {audience_claim} if isinstance(audience_claim, str) else set(audience_claim or [])
        if JWT_AUDIENCE not in audiences:
            raise HTTPException(status_code=403, detail="Invalid token audience")

    return payload


def authorize_request(request: Request) -> AuthContext:
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = auth_header.split(" ", 1)[1]
    payload = decode_jwt_token(token)

    user_id = payload.get("userId")
    publisher_id = payload.get("publisherId")
    email = payload.get("email")
    role = payload.get("role", "publisher")

    if not (user_id and publisher_id and email):
        raise HTTPException(status_code=401, detail="Invalid token claims")

    if ALLOWED_ROLES and role not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Role not permitted")

    tenant_hint = request.headers.get(TENANT_HEADER)
    if tenant_hint and tenant_hint != publisher_id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")

    context = AuthContext(user_id=user_id, publisher_id=publisher_id, email=email, role=role)
    request.state.auth_context = context

    key = f"{publisher_id}:{request.url.path}"
    RATE_LIMITER.hit(key)

    return context


def resolve_model_path(env_var: str, default: str) -> Path:
    raw_path = os.getenv(env_var, default)
    candidate = Path(raw_path).expanduser().resolve()
    if not candidate.exists():
        raise FileNotFoundError(f"Required model artifact missing at {candidate}")
    if candidate.is_dir():
        raise IsADirectoryError(f"Expected file for {env_var}, found directory at {candidate}")
    return candidate


def load_model():
    """Load ONNX model for CPU inference."""
    try:
        model_path = resolve_model_path("MODEL_PATH", "models/fraud/latest/fraud_model.onnx")
    except (FileNotFoundError, IsADirectoryError) as exc:
        if not ALLOW_MODEL_MOCKS:
            raise
        logger.warning(
            "Model artifact missing but mock mode enabled",
            extra={"error": str(exc)},
        )
        state.model = None
        state.threshold = 0.5
        state.feature_names = []
        state.model_version = "mock"
        return

    try:
        # CPU-optimized session with quantization support
        session_options = ort.SessionOptions()
        session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        session_options.intra_op_num_threads = int(os.getenv("OMP_NUM_THREADS", "4"))

        state.model = ort.InferenceSession(
            str(model_path),
            sess_options=session_options,
            providers=["CPUExecutionProvider"],
        )

        # Load metadata if present
        meta_path_default = "models/fraud/latest/trained_fraud_model.json"
        meta_path_env = os.getenv("MODEL_META_PATH", meta_path_default)
        meta_path = Path(meta_path_env).expanduser().resolve()
        if meta_path.exists():
            import json

            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
                state.threshold = float(meta.get("threshold", 0.5))
                state.feature_names = meta.get("features", [])
                state.model_version = meta.get("version", meta_path.parent.name)
        else:
            logger.warning("Model metadata not found; using defaults", extra={"meta_path": str(meta_path)})

        scaler_path_env = os.getenv("MODEL_SCALER_PATH")
        scaler_candidate = Path(scaler_path_env).expanduser().resolve() if scaler_path_env else meta_path.with_name("scaler.joblib")
        if scaler_candidate.exists():
            state.scaler = joblib.load(scaler_candidate)
            logger.info("Loaded scaler", extra={"scaler_path": str(scaler_candidate)})

        logger.info(
            "Model loaded",
            extra={
                "model_path": str(model_path),
                "version": state.model_version,
                "threshold": state.threshold,
                "features": state.feature_names or "fallback",
            },
        )

    except Exception as e:
        logger.error("Failed to load model", extra={"error": str(e)})
        raise


def transform_features(sample: FraudFeatures) -> np.ndarray:
    """Build model-ready feature array and run optional preprocessing."""
    feature_array = np.array(
        [
            [
                sample.feature_1,
                sample.feature_2,
                sample.feature_3,
            ]
        ],
        dtype=np.float32,
    )

    if state.scaler is not None:
        try:
            feature_array = state.scaler.transform(feature_array)
        except Exception as exc:
            logger.warning("Failed to transform features with scaler", extra={"error": str(exc)})

    return feature_array.astype(np.float32, copy=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    logger.info("Starting fraud inference service...")
    load_model()
    yield
    logger.info("Shutting down fraud inference service...")


app = FastAPI(
    title="Fraud Detection Inference Service",
    description="CPU-optimized fraud scoring with RED metrics",
    version="1.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    """Record RED metrics for all requests."""
    start_time = time.time()
    
    try:
        response = await call_next(request)
        duration = time.time() - start_time
        
        endpoint = request.url.path
        REQUEST_COUNT.labels(endpoint=endpoint, status=response.status_code).inc()
        REQUEST_DURATION.labels(endpoint=endpoint).observe(duration)
        
        return response
    
    except Exception as e:
        duration = time.time() - start_time
        endpoint = request.url.path
        
        ERROR_COUNT.labels(endpoint=endpoint, error_type=type(e).__name__).inc()
        REQUEST_DURATION.labels(endpoint=endpoint).observe(duration)
        
        raise


@app.get("/health/live", response_model=HealthResponse, tags=["Health"])
async def liveness():
    """
    Liveness probe: service is running.
    Returns 200 if process is alive.
    """
    return HealthResponse(
        status="alive",
        model_loaded=state.model is not None,
        model_version=state.model_version,
        uptime_seconds=time.time() - state.start_time,
    )


@app.get("/health/ready", response_model=HealthResponse, tags=["Health"])
async def readiness():
    """
    Readiness probe: service is ready to accept traffic.
    Returns 200 if model is loaded, 503 otherwise.
    """
    if state.model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    return HealthResponse(
        status="ready",
        model_loaded=True,
        model_version=state.model_version,
        uptime_seconds=time.time() - state.start_time,
    )


@app.get("/metrics", tags=["Observability"])
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/v1/score", response_model=FraudScore, tags=["Inference"])
async def score_fraud(features: FraudFeatures, auth: AuthContext = Depends(authorize_request)):
    """
    Score fraud probability for given features.
    
    Returns fraud score (0-1) and binary decision based on threshold.
    """
    _ = auth  # enforce dependency evaluation
    if state.model is None:
        ERROR_COUNT.labels(endpoint="/v1/score", error_type="ModelNotLoaded").inc()
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    start_time = time.time()
    
    try:
        # Prepare input features
        feature_array = transform_features(features)
        
        # Run inference
        input_name = state.model.get_inputs()[0].name
        output_name = state.model.get_outputs()[0].name
        
        outputs = state.model.run([output_name], {input_name: feature_array})
        
        # Extract fraud probability
        if len(outputs[0].shape) > 1 and outputs[0].shape[1] > 1:
            fraud_score = float(outputs[0][0][1])  # Binary classifier
        else:
            fraud_score = float(outputs[0][0])
        
        latency_ms = (time.time() - start_time) * 1000
        
        return FraudScore(
            fraud_score=fraud_score,
            is_fraud=fraud_score >= state.threshold,
            threshold=state.threshold,
            latency_ms=latency_ms,
        )
    
    except Exception as e:
        logger.error(f"Inference error: {e}")
        ERROR_COUNT.labels(endpoint="/v1/score", error_type=type(e).__name__).inc()
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")


@app.post("/v1/score/batch", response_model=List[FraudScore], tags=["Inference"])
async def score_fraud_batch(
    features_list: List[FraudFeatures],
    auth: AuthContext = Depends(authorize_request),
):
    """
    Batch fraud scoring for multiple samples.
    More efficient than individual requests for large batches.
    """
    _ = auth

    if state.model is None:
        ERROR_COUNT.labels(endpoint="/v1/score/batch", error_type="ModelNotLoaded").inc()
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if len(features_list) > 1000:
        raise HTTPException(status_code=400, detail="Batch size limited to 1000")
    
    start_time = time.time()
    
    try:
        # Prepare batch input
        feature_matrix = np.vstack([transform_features(f) for f in features_list])
        
        # Batch inference
        input_name = state.model.get_inputs()[0].name
        output_name = state.model.get_outputs()[0].name
        
        outputs = state.model.run([output_name], {input_name: feature_matrix})
        
        # Extract scores
        if len(outputs[0].shape) > 1 and outputs[0].shape[1] > 1:
            fraud_scores = outputs[0][:, 1].tolist()
        else:
            fraud_scores = outputs[0].flatten().tolist()
        
        total_latency_ms = (time.time() - start_time) * 1000
        per_sample_latency = total_latency_ms / len(features_list)
        
        return [
            FraudScore(
                fraud_score=score,
                is_fraud=score >= state.threshold,
                threshold=state.threshold,
                latency_ms=per_sample_latency,
            )
            for score in fraud_scores
        ]
    
    except Exception as e:
        logger.error(f"Batch inference error: {e}")
        ERROR_COUNT.labels(endpoint="/v1/score/batch", error_type=type(e).__name__).inc()
        raise HTTPException(status_code=500, detail=f"Batch inference failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8080")),
        log_level="info",
    )
