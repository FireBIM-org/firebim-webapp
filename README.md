# FireBIM webapp
[![Build & Push Image](https://github.com/FireBIM-org/firebim-webapp/actions/workflows/build-image.yml/badge.svg)](https://github.com/FireBIM-org/firebim-webapp/actions/workflows/build-image.yml)
[![CI](https://github.com/FireBIM-org/firebim-webapp/actions/workflows/ci.yml/badge.svg)](https://github.com/FireBIM-org/firebim-webapp/actions/workflows/ci.yml)

Frontend for [firebim-api-server](https://github.com/FireBIM-org/firebim-api-server). Built with Next.js (Pages Router), NextAuth, TanStack Query, and Tailwind CSS.

## Features

* Register user
* Login/logout
* Upload IFC file
* View list of IFC files
* View IFC file details (including download)
* Upload IDS file
* View list of IDS files
* View IDS file details (including download)
* Make analysis of IFC file using IDS file
* Build, save, and publish rule elements and rules in RuleBuilder
* Review, run, and inspect rules against graphs in RuleBook

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 22 |
| pnpm | 10 |
| Docker & Docker Compose | latest |
| firebim-api-server stack | running |

Install pnpm via corepack:
```bash
corepack enable && corepack prepare pnpm@10 --activate
```

## Getting Started

### 1. Start the backend stack

The webapp depends on a running instance of firebim-api-server. Start it first:

```bash
cd ../firebim-api-server
docker compose up -d
```

Wait for Authentik to finish initialising at [http://localhost:9080](http://localhost:9080) before starting the webapp.

### 2. Configure the webapp

For local `pnpm` development, copy the example env file and adjust if needed:

```bash
cp .env.example .env.local
```

For Docker development, `docker-compose.yml` already matches the standard local FireBIM stack:

* `API_BACKEND_URL=http://api:8000`
* `AUTHENTIK_ISSUER_URL=http://localhost:9080/application/o/firebim/`
* `AUTHENTIK_INTERNAL_ISSUER_URL=http://authentik-server:9000/application/o/firebim/`
* `AUTHENTIK_CLIENT_ID=firebim`
* `AUTHENTIK_CLIENT_SECRET=local-dev-client-secret`
* `FIREBIM_API_NETWORK=firebim_api_server_lexicon_default`

That means the frontend container talks to your local API/Auth stack without any backend changes. Only update those values if your local ports, credentials, or Docker network name differ.

### 3a. Run with Docker (recommended)

```bash
make up-build
```

The webapp will be available at [http://localhost:3000](http://localhost:3000).

```bash
make logs     # tail container logs
make down     # stop the container
```

### 3b. Run with pnpm (hot-reload dev server)

```bash
make install  # install dependencies (first time only)
make dev      # starts Next.js with Turbopack at http://localhost:3000
```

> **Note:** When running outside Docker you still need the backend stack running via Docker Compose.

## Common tasks

| Command | Description |
|---------|-------------|
| `make install` | Install / update dependencies |
| `make dev` | Start dev server with hot-reload |
| `make build` | Production build |
| `make lint` | Run ESLint |
| `make generate-api` | Regenerate `src/types/api.ts` from `openapi.json` |
| `make up-build` | Rebuild and start Docker container |
| `make down` | Stop Docker container |
| `make logs` | Tail Docker container logs |

## Architecture

```
Browser  ──►  Next.js (port 3000)
                │
                ├─ /api/proxy/…  ──►  firebim-api-server (FastAPI)
                └─ /api/auth/…   ──►  NextAuth ──► Authentik (OIDC)
```

Server-side NextAuth callbacks and the proxy route reach the backend and Authentik directly via the Docker network (or `localhost` via `extra_hosts` when running in a container).

## Rule Features

The webapp also includes two authenticated rule-focused areas:

* `RuleBuilder` for assembling rule elements, connecting decision flows, and publishing rules
* `RuleBook` for loading graphs, checking rule compatibility, running diagnostics, and inspecting graph execution

Both features follow the same Authentik/NextAuth setup and proxy-based API access as the rest of the application.
