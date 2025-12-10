import shutil
import tempfile
from pathlib import Path

import numpy as np
import pytest
import torch

from ml_pipelines.models.torch_models import train_ft_transformer

def test_train_ft_transformer():
    # Generate synthetic data
    num_samples = 100
    num_numerical = 5
    cat_cardinalities = [10, 5, 2]
    num_categorical = len(cat_cardinalities)
    
    X_num = np.random.randn(num_samples, num_numerical).astype(np.float32)
    X_cat = np.zeros((num_samples, num_categorical), dtype=np.int64)
    for i, c in enumerate(cat_cardinalities):
        X_cat[:, i] = np.random.randint(0, c, size=num_samples)
        
    y = np.random.randint(0, 2, size=num_samples).astype(np.float32)
    
    # Split
    split = int(num_samples * 0.8)
    X_train_num, X_val_num = X_num[:split], X_num[split:]
    X_train_cat, X_val_cat = X_cat[:split], X_cat[split:]
    y_train, y_val = y[:split], y[split:]
    
    output_dir = Path(tempfile.mkdtemp())
    (output_dir / "onnx").mkdir(parents=True)
    
    try:
        device = torch.device("cpu")
        result = train_ft_transformer(
            X_train_num, X_train_cat, y_train,
            X_val_num, X_val_cat, y_val,
            cat_cardinalities,
            device=device,
            output_dir=output_dir,
            epochs=2,
            batch_size=16,
            learning_rate=1e-3
        )
        
        assert "metrics" in result
        assert "artifacts" in result
        assert (output_dir / "ft_transformer.pt").exists()
        assert (output_dir / "onnx" / "ft_transformer.onnx").exists()
        assert (output_dir / "ft_transformer_meta.json").exists()
        
    finally:
        shutil.rmtree(output_dir)

if __name__ == "__main__":
    test_train_ft_transformer()
    print("Test passed!")
