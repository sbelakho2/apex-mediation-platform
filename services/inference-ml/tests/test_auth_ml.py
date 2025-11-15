"""Authentication and throttling tests for ML inference service."""

import base64
import hashlib
import hmac
import importlib.util
import json
import os
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY


MODULE_NAME = "ml_inference_main"
MODULE_PATH = Path(__file__).resolve().parents[1] / "main.py"


def _issue_token(secret: str, overrides: dict | None = None) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "userId": "user-123",
        "publisherId": "pub-xyz",
        "email": "ops@example.com",
        "role": "publisher",
        "exp": int(time.time()) + 3600,
    }
    if overrides:
        payload.update(overrides)

    def _b64(data: dict) -> str:
        return base64.urlsafe_b64encode(
            json.dumps(data, separators=(",", ":")).encode("utf-8")
        ).rstrip(b"=").decode("ascii")

    signing_input = f"{_b64(header)}.{_b64(payload)}"
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    ).rstrip(b"=").decode("ascii")
    return f"{signing_input}.{signature}"


def _load_module():
    for collector in list(REGISTRY._collector_to_names.keys()):  # type: ignore[attr-defined]
        try:
            REGISTRY.unregister(collector)
        except KeyError:
            pass
    if MODULE_NAME in sys.modules:
        del sys.modules[MODULE_NAME]
    spec = importlib.util.spec_from_file_location(MODULE_NAME, MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[MODULE_NAME] = module
    spec.loader.exec_module(module)  # type: ignore[attr-defined]
    return module


def build_client(rate_limit: int = 2):
    secret = "y" * 48
    os.environ["JWT_SECRET"] = secret
    os.environ["ALLOW_MODEL_MOCKS"] = "true"
    os.environ["REQUIRED_MODELS"] = ""
    os.environ["RATE_LIMIT_MAX_REQUESTS"] = str(rate_limit)
    os.environ["RATE_LIMIT_WINDOW_SECONDS"] = "60"

    module = _load_module()
    module.RATE_LIMITER.reset()
    module.refresh_model_registry()

    client = TestClient(module.app)
    return module, client, secret


@pytest.fixture()
def fraud_request_payload():
    return {
        "user_id": "user-123",
        "ip_address": "203.0.113.1",
        "user_agent": "pytest",
        "impressions_24h": 10,
        "clicks_24h": 1,
    }


def test_predict_requires_auth(fraud_request_payload):
    module, client, _ = build_client()
    response = client.post("/predict/fraud", json=fraud_request_payload)
    assert response.status_code == 401


def test_predict_rejects_tenant_mismatch(fraud_request_payload):
    module, client, secret = build_client()
    token = _issue_token(secret)
    headers = {"Authorization": f"Bearer {token}", "X-Publisher-Id": "other"}
    response = client.post("/predict/fraud", json=fraud_request_payload, headers=headers)
    assert response.status_code == 403


def test_rate_limit_blocks_excess_requests(fraud_request_payload):
    module, client, secret = build_client(rate_limit=2)
    token = _issue_token(secret)
    headers = {"Authorization": f"Bearer {token}"}

    first = client.post("/predict/fraud", json=fraud_request_payload, headers=headers)
    second = client.post("/predict/fraud", json=fraud_request_payload, headers=headers)
    third = client.post("/predict/fraud", json=fraud_request_payload, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 429