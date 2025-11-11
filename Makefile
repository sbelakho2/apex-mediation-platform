PYTHON ?= python
DATASET ?= data/enrichment/features/latest/ip_enrichment.parquet
OUTPUT ?= models

.PHONY: ml.fetch ml.prepare ml.train ml.train.gpu

ml.fetch:
	@$(PYTHON) ML/scripts/fetch_enrichment.py --output data/enrichment

ml.prepare:
	@$(PYTHON) scripts/ml/prepare_dataset.py --enrichment-root data/enrichment --output data/enrichment/features/latest

ml.train:
	@$(PYTHON) scripts/ml/train_models.py $(DATASET) --output-root $(OUTPUT)

ml.train.gpu:
	@docker compose run --rm --profile ml-gpu ml-train-gpu $(DATASET) --output-root $(OUTPUT)
