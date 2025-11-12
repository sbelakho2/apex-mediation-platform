"""
FastAPI inference service for fraud detection with RED metrics.
CPU-optimized with quantization support, readiness/liveness probes.
"""
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

import joblib
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
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


state = ModelState()


def load_model():
    """Load ONNX model for CPU inference."""
    model_path = os.getenv("MODEL_PATH", "models/fraud/latest/fraud_model.onnx")
    
    try:
        # CPU-optimized session with quantization support
        session_options = ort.SessionOptions()
        session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        session_options.intra_op_num_threads = int(os.getenv("OMP_NUM_THREADS", "4"))
        
        state.model = ort.InferenceSession(
            model_path,
            sess_options=session_options,
            providers=["CPUExecutionProvider"],
        )
        
        # Load metadata
        meta_path = os.getenv("MODEL_META_PATH", "models/fraud/latest/trained_fraud_model.json")
        if os.path.exists(meta_path):
            import json
            with open(meta_path, "r") as f:
                meta = json.load(f)
                state.threshold = meta.get("threshold", 0.5)
                state.feature_names = meta.get("features", [])
                state.model_version = meta.get("version", "unknown")
        
        logger.info(f"Model loaded: {model_path} (version={state.model_version}, threshold={state.threshold})")
    
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise


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
async def score_fraud(features: FraudFeatures):
    """
    Score fraud probability for given features.
    
    Returns fraud score (0-1) and binary decision based on threshold.
    """
    if state.model is None:
        ERROR_COUNT.labels(endpoint="/v1/score", error_type="ModelNotLoaded").inc()
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    start_time = time.time()
    
    try:
        # Prepare input features
        feature_array = np.array([[
            features.feature_1,
            features.feature_2,
            features.feature_3,
        ]], dtype=np.float32)
        
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
async def score_fraud_batch(features_list: List[FraudFeatures]):
    """
    Batch fraud scoring for multiple samples.
    More efficient than individual requests for large batches.
    """
    if state.model is None:
        ERROR_COUNT.labels(endpoint="/v1/score/batch", error_type="ModelNotLoaded").inc()
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if len(features_list) > 1000:
        raise HTTPException(status_code=400, detail="Batch size limited to 1000")
    
    start_time = time.time()
    
    try:
        # Prepare batch input
        feature_matrix = np.array([
            [f.feature_1, f.feature_2, f.feature_3]
            for f in features_list
        ], dtype=np.float32)
        
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
