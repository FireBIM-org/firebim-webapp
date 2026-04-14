.PHONY: help install dev build lint generate-api up up-build down logs

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# =============================================================================
# Local development (pnpm)
# =============================================================================

install: ## Install dependencies
	pnpm install

dev: ## Start Next.js dev server with Turbopack
	pnpm dev

build: ## Build for production
	pnpm build

lint: ## Run ESLint
	pnpm lint

generate-api: ## Regenerate TypeScript types from openapi.json
	pnpm generate:api

# =============================================================================
# Docker Compose
# =============================================================================

up: ## Start webapp container (detached)
	docker compose up -d

up-build: ## Rebuild and start webapp container (detached)
	docker compose up -d --build

down: ## Stop and remove webapp container
	docker compose down

logs: ## Tail webapp container logs
	docker compose logs -f webapp
