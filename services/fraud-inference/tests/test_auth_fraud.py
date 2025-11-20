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


def _auth_headers(secret: str, *, tenant: str = "pub-abc", payload_overrides: dict | None = None):
    token_overrides = dict(payload_overrides or {})
    if tenant:
        token_overrides["publisherId"] = tenant
    token = _issue_token(secret, token_overrides or None)
    headers = {"Authorization": f"Bearer {token}"}
    if tenant:
        headers["X-Publisher-Id"] = tenant
    return headers


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


def build_client(rate_limit: int = 2, *, overrides: dict | None = None, default_mode: str = "shadow"):
    secret = "x" * 48
    os.environ["JWT_SECRET"] = secret
    os.environ["ALLOW_MODEL_MOCKS"] = "true"
    os.environ["RATE_LIMIT_MAX_REQUESTS"] = str(rate_limit)
    os.environ["RATE_LIMIT_WINDOW_SECONDS"] = "60"
    os.environ["FRAUD_MODE"] = default_mode
    os.environ["FRAUD_MODE_OVERRIDES_JSON"] = json.dumps(overrides or {})

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


def test_missing_tenant_header_rejected(sample_payload):
    module, client, secret = build_client()
    token = _issue_token(secret)
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/v1/score", json=sample_payload, headers=headers)
    assert response.status_code == 400


def test_score_rejects_tenant_mismatch(sample_payload):
    module, client, secret = build_client()
    headers = _auth_headers(secret)
    headers["X-Publisher-Id"] = "other"
    response = client.post("/v1/score", json=sample_payload, headers=headers)
    assert response.status_code == 403


def test_rate_limit_enforced_per_publisher(sample_payload):
    module, client, secret = build_client(rate_limit=2)
    headers = _auth_headers(secret)

    first = client.post("/v1/score", json=sample_payload, headers=headers)
    second = client.post("/v1/score", json=sample_payload, headers=headers)
    third = client.post("/v1/score", json=sample_payload, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 429


def test_shadow_mode_returns_shadow_decision(sample_payload):
    module, client, secret = build_client(default_mode="shadow")
    headers = _auth_headers(secret)
    response = client.post("/v1/score", json=sample_payload, headers=headers)
    body = response.json()
    assert response.status_code == 200
    assert body["mode"] == "shadow"
    assert body["shadow_decision"] is True
    assert body["is_fraud"] is False


def test_block_mode_override_enabled(sample_payload):
    module, client, secret = build_client(overrides={"pub-abc": "block"})
    headers = _auth_headers(secret)
    response = client.post("/v1/score", json=sample_payload, headers=headers)
    body = response.json()
    assert response.status_code == 200
    assert body["mode"] == "block"
    assert body["is_fraud"] is True


def test_redaction_buffer_hashes_consent_fields(sample_payload):
    module, client, secret = build_client()
    headers = _auth_headers(secret)
    payload = dict(sample_payload)
    payload.update({"consent_tcf": "COabcd123", "us_privacy": "1YNN", "consent_gdpr": True})
    response = client.post("/v1/score", json=payload, headers=headers)
    assert response.status_code == 200

    snapshot = module.DEBUG_BUFFER.snapshot()
    assert snapshot, "redaction buffer should contain entries"
    latest = snapshot[-1]
    assert latest["tenant"] == "pub-abc"
    assert latest["consent"]["tcf_hash"] not in {None, payload["consent_tcf"]}
    assert latest["consent"]["us_privacy_hash"] not in {None, payload["us_privacy"]}


def test_metrics_include_histogram_and_drift(sample_payload):
    module, client, secret = build_client(rate_limit=100)
    headers = _auth_headers(secret)

    for _ in range(6):
        assert client.post("/v1/score", json=sample_payload, headers=headers).status_code == 200

    while len(module.GLOBAL_SCORE_WINDOW) < 20:
        module.GLOBAL_SCORE_WINDOW.append(0.2)
    module.SCORE_WINDOWS["pub-abc"].extend([0.1, 0.2, 0.3, 0.4, 0.5])
    module._update_drift_metric("pub-abc")

    metrics = client.get("/metrics")
    assert metrics.status_code == 200
    text = metrics.text
    assert "fraud_score_histogram_bucket" in text
    assert "fraud_drift_js_divergence" in text