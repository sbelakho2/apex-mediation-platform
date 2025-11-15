"""Authentication and rate-limiting tests for fraud inference service."""

import base64
import hashlib
import hmac
import importlib.util
import json
import os
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY


MODULE_NAME = "fraud_inference_main"
MODULE_PATH = Path(__file__).resolve().parents[1] / "main.py"


class DummySession:
    def __init__(self) -> None:
        self._input = SimpleNamespace(name="input")
        self._output = SimpleNamespace(name="output")

    def get_inputs(self):
        return [self._input]

    def get_outputs(self):
        return [self._output]

    def run(self, _outputs, _feed):
        return [np.array([[0.1, 0.9]], dtype=np.float32)]


def _issue_token(secret: str, overrides: dict | None = None) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "userId": "user-123",
        "publisherId": "pub-abc",
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

    signing_input = f"{_b64(header)}.{_b64(payload)}".encode("ascii")
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    ).rstrip(b"=").decode("ascii")

    return f"{signing_input.decode('ascii')}.{signature}"


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
    secret = "x" * 48
    os.environ["JWT_SECRET"] = secret
    os.environ["ALLOW_MODEL_MOCKS"] = "true"
    os.environ["RATE_LIMIT_MAX_REQUESTS"] = str(rate_limit)
    os.environ["RATE_LIMIT_WINDOW_SECONDS"] = "60"

    module = _load_module()
    module.RATE_LIMITER.reset()
    module.state.model = DummySession()
    module.state.threshold = 0.5

    client = TestClient(module.app)
    return module, client, secret


@pytest.fixture()
def sample_payload():
    return {"feature_1": 0.1, "feature_2": 0.2, "feature_3": 0.3}


def test_score_requires_bearer_token(sample_payload):
    module, client, _ = build_client()
    response = client.post("/v1/score", json=sample_payload)
    assert response.status_code == 401


def test_score_rejects_tenant_mismatch(sample_payload):
    module, client, secret = build_client()
    token = _issue_token(secret)
    headers = {"Authorization": f"Bearer {token}", "X-Publisher-Id": "other"}
    response = client.post("/v1/score", json=sample_payload, headers=headers)
    assert response.status_code == 403


def test_rate_limit_enforced_per_publisher(sample_payload):
    module, client, secret = build_client(rate_limit=2)
    token = _issue_token(secret)
    headers = {"Authorization": f"Bearer {token}"}

    first = client.post("/v1/score", json=sample_payload, headers=headers)
    second = client.post("/v1/score", json=sample_payload, headers=headers)
    third = client.post("/v1/score", json=sample_payload, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 429