.PHONY: help up up-build

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# =============================================================================
# Docker Compose
# =============================================================================

up: ## Start all services
	docker compose up -d

up-build: ## Start all services with build
	docker compose up -d --build
