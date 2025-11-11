"""
ML Inference Service

FastAPI service for serving ML model predictions with Prometheus metrics.
Supports fraud detection, CTR prediction, and bid optimization models.
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import structlog
import time
import os

# Initialize structured logging
logger = structlog.get_logger()

# Prometheus metrics
INFERENCE_REQUESTS = Counter(
    'ml_inference_requests_total',
    'Total number of inference requests',
    ['model_name', 'status']
)

INFERENCE_LATENCY = Histogram(
    'ml_inference_duration_seconds',
    'Inference request duration in seconds',
    ['model_name'],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]
)

INFERENCE_ERRORS = Counter(
    'ml_inference_errors_total',
    'Total number of inference errors',
    ['model_name', 'error_type']
)

MODEL_LOAD_TIME = Gauge(
    'ml_model_load_time_seconds',
    'Time taken to load model',
    ['model_name']
)

ACTIVE_MODELS = Gauge(
    'ml_active_models',
    'Number of currently loaded models'
)

# Pydantic models
class FraudDetectionRequest(BaseModel):
    user_id: str
    ip_address: str
    user_agent: str
    impressions_24h: int = Field(ge=0)
    clicks_24h: int = Field(ge=0)
    app_id: Optional[str] = None
    device_info: Optional[Dict[str, Any]] = None

class CTRPredictionRequest(BaseModel):
    placement_id: str
    ad_format: str
    user_segments: List[str] = []
    time_of_day: int = Field(ge=0, le=23)
    day_of_week: int = Field(ge=0, le=6)
    historical_ctr: Optional[float] = Field(None, ge=0.0, le=1.0)

class BidOptimizationRequest(BaseModel):
    placement_id: str
    floor_cpm: float = Field(ge=0)
    predicted_ctr: float = Field(ge=0.0, le=1.0)
    competition_level: str = Field(pattern="^(low|medium|high)$")
    budget_remaining: float = Field(ge=0)

class InferenceResponse(BaseModel):
    model_name: str
    model_version: str
    prediction: Any
    confidence: Optional[float] = None
    latency_ms: float

class HealthResponse(BaseModel):
    status: str
    models_loaded: int
    uptime_seconds: float

# FastAPI app
app = FastAPI(
    title="ML Inference Service",
    description="Production ML model serving for Rival Ad Platform",
    version="1.0.0"
)

# Global state
models = {}
start_time = time.time()

@app.on_event("startup")
async def startup_event():
    """Load ML models on startup"""
    logger.info("Starting ML inference service")
    
    # Load fraud detection model
    try:
        load_start = time.time()
        # TODO: Load actual model from models/ directory
        models['fraud_detection'] = {'version': '1.0.0', 'loaded': True}
        load_time = time.time() - load_start
        MODEL_LOAD_TIME.labels(model_name='fraud_detection').set(load_time)
        logger.info("Loaded fraud detection model", version="1.0.0", load_time=load_time)
    except Exception as e:
        logger.error("Failed to load fraud detection model", error=str(e))
    
    # Load CTR prediction model
    try:
        load_start = time.time()
        models['ctr_prediction'] = {'version': '1.0.0', 'loaded': True}
        load_time = time.time() - load_start
        MODEL_LOAD_TIME.labels(model_name='ctr_prediction').set(load_time)
        logger.info("Loaded CTR prediction model", version="1.0.0", load_time=load_time)
    except Exception as e:
        logger.error("Failed to load CTR prediction model", error=str(e))
    
    # Load bid optimization model
    try:
        load_start = time.time()
        models['bid_optimization'] = {'version': '1.0.0', 'loaded': True}
        load_time = time.time() - load_start
        MODEL_LOAD_TIME.labels(model_name='bid_optimization').set(load_time)
        logger.info("Loaded bid optimization model", version="1.0.0", load_time=load_time)
    except Exception as e:
        logger.error("Failed to load bid optimization model", error=str(e))
    
    ACTIVE_MODELS.set(len([m for m in models.values() if m.get('loaded')]))
    logger.info("ML inference service started", models_loaded=len(models))

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests with timing"""
    start_time_req = time.time()
    response = await call_next(request)
    duration = time.time() - start_time_req
    logger.info(
        "request_processed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration=duration
    )
    return response

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="ok",
        models_loaded=len([m for m in models.values() if m.get('loaded')]),
        uptime_seconds=time.time() - start_time
    )

@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    """Prometheus metrics endpoint"""
    return generate_latest()

@app.post("/predict/fraud", response_model=InferenceResponse)
async def predict_fraud(request: FraudDetectionRequest):
    """Fraud detection inference"""
    model_name = "fraud_detection"
    start = time.time()
    
    try:
        if model_name not in models or not models[model_name].get('loaded'):
            INFERENCE_ERRORS.labels(model_name=model_name, error_type='model_not_loaded').inc()
            raise HTTPException(status_code=503, detail="Model not loaded")
        
        # TODO: Actual inference logic
        # For now, return mock prediction
        fraud_score = 0.15  # Mock score
        
        latency = (time.time() - start) * 1000  # Convert to ms
        INFERENCE_LATENCY.labels(model_name=model_name).observe(time.time() - start)
        INFERENCE_REQUESTS.labels(model_name=model_name, status='success').inc()
        
        return InferenceResponse(
            model_name=model_name,
            model_version=models[model_name]['version'],
            prediction={'fraud_score': fraud_score, 'is_fraud': fraud_score > 0.5},
            confidence=0.87,
            latency_ms=latency
        )
    
    except Exception as e:
        INFERENCE_ERRORS.labels(model_name=model_name, error_type='inference_error').inc()
        INFERENCE_REQUESTS.labels(model_name=model_name, status='error').inc()
        logger.error("Fraud prediction failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/ctr", response_model=InferenceResponse)
async def predict_ctr(request: CTRPredictionRequest):
    """CTR prediction inference"""
    model_name = "ctr_prediction"
    start = time.time()
    
    try:
        if model_name not in models or not models[model_name].get('loaded'):
            INFERENCE_ERRORS.labels(model_name=model_name, error_type='model_not_loaded').inc()
            raise HTTPException(status_code=503, detail="Model not loaded")
        
        # TODO: Actual inference logic
        predicted_ctr = 0.025  # Mock CTR
        
        latency = (time.time() - start) * 1000
        INFERENCE_LATENCY.labels(model_name=model_name).observe(time.time() - start)
        INFERENCE_REQUESTS.labels(model_name=model_name, status='success').inc()
        
        return InferenceResponse(
            model_name=model_name,
            model_version=models[model_name]['version'],
            prediction={'predicted_ctr': predicted_ctr},
            confidence=0.82,
            latency_ms=latency
        )
    
    except Exception as e:
        INFERENCE_ERRORS.labels(model_name=model_name, error_type='inference_error').inc()
        INFERENCE_REQUESTS.labels(model_name=model_name, status='error').inc()
        logger.error("CTR prediction failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/bid", response_model=InferenceResponse)
async def optimize_bid(request: BidOptimizationRequest):
    """Bid optimization inference"""
    model_name = "bid_optimization"
    start = time.time()
    
    try:
        if model_name not in models or not models[model_name].get('loaded'):
            INFERENCE_ERRORS.labels(model_name=model_name, error_type='model_not_loaded').inc()
            raise HTTPException(status_code=503, detail="Model not loaded")
        
        # TODO: Actual inference logic
        optimized_bid = request.floor_cpm * 1.2  # Mock bid
        
        latency = (time.time() - start) * 1000
        INFERENCE_LATENCY.labels(model_name=model_name).observe(time.time() - start)
        INFERENCE_REQUESTS.labels(model_name=model_name, status='success').inc()
        
        return InferenceResponse(
            model_name=model_name,
            model_version=models[model_name]['version'],
            prediction={'optimized_cpm': optimized_bid, 'confidence_interval': [optimized_bid * 0.9, optimized_bid * 1.1]},
            confidence=0.79,
            latency_ms=latency
        )
    
    except Exception as e:
        INFERENCE_ERRORS.labels(model_name=model_name, error_type='inference_error').inc()
        INFERENCE_REQUESTS.labels(model_name=model_name, status='error').inc()
        logger.error("Bid optimization failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/models")
async def list_models():
    """List loaded models"""
    return {
        "models": [
            {
                "name": name,
                "version": info['version'],
                "loaded": info.get('loaded', False)
            }
            for name, info in models.items()
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
