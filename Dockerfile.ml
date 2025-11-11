# CPU-focused image for running ML enrichment and training pipelines
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace

COPY ML/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /tmp/requirements.txt

COPY ML /workspace/ML
COPY scripts /workspace/scripts

ENV PYTHONPATH=/workspace/ML/src:$PYTHONPATH

ENTRYPOINT ["python", "scripts/ml/train_models.py"]
CMD ["--help"]
