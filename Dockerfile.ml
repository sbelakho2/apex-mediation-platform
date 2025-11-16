# CPU-focused image for running ML enrichment and training pipelines
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace

# Install dependencies with constraints to ensure parity across envs (FIX-06)
COPY ML/requirements.txt /tmp/requirements.txt
COPY ML/constraints.txt /tmp/constraints.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -c /tmp/constraints.txt -r /tmp/requirements.txt

COPY ML /workspace/ML
COPY scripts /workspace/scripts

ENV PYTHONPATH=/workspace/ML/src:$PYTHONPATH

ENTRYPOINT ["python", "scripts/ml/train_models.py"]
CMD ["--help"]
