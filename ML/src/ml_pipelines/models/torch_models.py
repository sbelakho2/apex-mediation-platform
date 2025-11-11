"""Deep models (autoencoder and DeepSVDD) built with PyTorch."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Tuple

import joblib
import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from ml_pipelines.evaluation import classification_metrics


@dataclass
class TemperatureScaler:
    temperature: float = 1.0

    def fit(self, logits: np.ndarray, labels: np.ndarray) -> None:
        logits_tensor = torch.tensor(logits, dtype=torch.float64)
        labels_tensor = torch.tensor(labels, dtype=torch.float64)
        parameter = torch.nn.Parameter(torch.ones(1, dtype=torch.float64))
        optimizer = torch.optim.LBFGS([parameter], max_iter=50, line_search_fn="strong_wolfe")

        def closure() -> torch.Tensor:
            optimizer.zero_grad()
            loss = torch.nn.functional.binary_cross_entropy_with_logits(
                logits_tensor / parameter, labels_tensor
            )
            loss.backward()
            return loss

        optimizer.step(closure)
        self.temperature = float(parameter.detach().cpu().float())

    def transform(self, logits: np.ndarray) -> np.ndarray:
        return 1.0 / (1.0 + np.exp(-logits / self.temperature))


class AutoEncoder(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int) -> None:
        super().__init__()
        bottleneck = max(4, hidden_dim // 2)
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, bottleneck),
            nn.ReLU(),
        )
        self.decoder = nn.Sequential(
            nn.Linear(bottleneck, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, input_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # pragma: no cover - exercised indirectly
        encoded = self.encoder(x)
        decoded = self.decoder(encoded)
        return decoded


class DeepSVDDNet(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int) -> None:
        super().__init__()
        embed_dim = max(4, hidden_dim // 2)
        self.network = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, embed_dim),
        )
        self.classifier = nn.Linear(embed_dim, 1)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:  # pragma: no cover
        embedding = self.network(x)
        logits = self.classifier(torch.relu(embedding)).squeeze(-1)
        return embedding, logits


def train_autoencoder(
    X_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    *,
    device: torch.device,
    output_dir: Path,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    hidden_dim: int,
) -> Dict[str, object]:
    model = AutoEncoder(X_train.shape[1], hidden_dim).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    criterion = nn.MSELoss()

    train_loader = _dataloader(X_train, batch_size, device)
    val_tensor = torch.from_numpy(X_val).float().to(device)

    best_loss = float("inf")
    patience = 2
    epochs_without_improvement = 0

    for _ in range(epochs):
        model.train()
        epoch_loss = 0.0
        for batch in train_loader:
            batch = batch[0].to(device)
            optimizer.zero_grad()
            recon = model(batch)
            loss = criterion(recon, batch)
            loss.backward()
            optimizer.step()
            epoch_loss += float(loss.item())

        model.eval()
        with torch.no_grad():
            recon_val = model(val_tensor)
            val_loss = criterion(recon_val, val_tensor).item()

        if val_loss < best_loss:
            best_loss = val_loss
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= patience:
                break

    model.eval()
    with torch.no_grad():
        train_recon = model(torch.from_numpy(X_train).float().to(device))
        val_recon = model(val_tensor)

    train_err = _reconstruction_error(X_train, train_recon.cpu().numpy())
    val_err = _reconstruction_error(X_val, val_recon.cpu().numpy())

    logits = -val_err  # higher score => more likely fraud
    scaler = TemperatureScaler()
    scaler.fit(logits, y_val)
    calibrated = scaler.transform(logits)
    metrics = classification_metrics(y_val, calibrated, prefix="autoencoder")

    torch_path = output_dir / "autoencoder.pt"
    scripted = torch.jit.script(model.cpu())
    scripted.save(torch_path)

    torch_path_ensemble = output_dir / "model.pt"
    scripted.save(torch_path_ensemble)

    onnx_path = output_dir / "onnx" / "autoencoder.onnx"
    dummy = torch.randn(1, X_train.shape[1])
    torch.onnx.export(scripted, dummy, onnx_path, input_names=["input"], output_names=["output"], opset_version=17)

    joblib_path = output_dir / "autoencoder_calibrator.joblib"
    joblib.dump({"temperature": scaler.temperature}, joblib_path)

    metrics.update(
        {
            "autoencoder_temperature": scaler.temperature,
            "autoencoder_val_loss": float(best_loss),
        }
    )

    return {
        "metrics": metrics,
        "artifacts": {
            "autoencoder_torch": torch_path,
            "torchscript_entry": torch_path_ensemble,
            "autoencoder_onnx": onnx_path,
            "autoencoder_calibrator": joblib_path,
        },
        "val_probabilities": calibrated,
    }


def train_deepsvdd(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    *,
    device: torch.device,
    output_dir: Path,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    hidden_dim: int,
) -> Dict[str, object]:
    model = DeepSVDDNet(X_train.shape[1], hidden_dim).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)

    dataset = TensorDataset(
        torch.from_numpy(X_train).float(), torch.from_numpy(y_train).float()
    )
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    margin = 1.0
    patience = 2
    best_loss = float("inf")
    epochs_without_improvement = 0

    for _ in range(epochs):
        model.train()
        running_loss = 0.0
        for features, labels in loader:
            features = features.to(device)
            labels = labels.to(device)
            optimizer.zero_grad()
            embedding, logits = model(features)
            center = embedding.mean(dim=0)
            distances = torch.sum((embedding - center) ** 2, dim=1)
            normal_mask = labels == 0
            anomaly_mask = labels == 1
            normal_loss = distances[normal_mask].mean() if normal_mask.any() else 0.0
            anomaly_loss = torch.relu(margin - torch.sqrt(distances[anomaly_mask] + 1e-8)).mean() if anomaly_mask.any() else 0.0
            logistic_loss = torch.nn.functional.binary_cross_entropy_with_logits(logits, labels)
            loss = normal_loss + anomaly_loss + 0.1 * logistic_loss
            loss.backward()
            optimizer.step()
            running_loss += float(loss.item())

        if running_loss < best_loss:
            best_loss = running_loss
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= patience:
                break

    model.eval()
    with torch.no_grad():
        _, val_logits = model(torch.from_numpy(X_val).float().to(device))

    logits = val_logits.detach().cpu().numpy()
    scaler = TemperatureScaler()
    scaler.fit(logits, y_val)
    calibrated = scaler.transform(logits)
    metrics = classification_metrics(y_val, calibrated, prefix="deepsvdd")
    metrics.update({"deepsvdd_temperature": scaler.temperature, "deepsvdd_train_loss": float(best_loss)})

    torch_path = output_dir / "deepsvdd.pt"
    scripted = torch.jit.script(model.cpu())
    scripted.save(torch_path)

    onnx_path = output_dir / "onnx" / "deepsvdd.onnx"
    dummy = torch.randn(1, X_train.shape[1])
    torch.onnx.export(scripted, dummy, onnx_path, input_names=["input"], output_names=["logits"], opset_version=17)

    joblib_path = output_dir / "deepsvdd_calibrator.joblib"
    joblib.dump({"temperature": scaler.temperature}, joblib_path)

    return {
        "metrics": metrics,
        "artifacts": {
            "deepsvdd_torch": torch_path,
            "deepsvdd_onnx": onnx_path,
            "deepsvdd_calibrator": joblib_path,
        },
        "val_probabilities": calibrated,
    }


def _dataloader(features: np.ndarray, batch_size: int, device: torch.device) -> DataLoader:
    tensor = torch.from_numpy(features).float()
    dataset = TensorDataset(tensor)
    return DataLoader(dataset, batch_size=batch_size, shuffle=True)


def _reconstruction_error(original: np.ndarray, reconstructed: np.ndarray) -> np.ndarray:
    return np.mean((original - reconstructed) ** 2, axis=1)
