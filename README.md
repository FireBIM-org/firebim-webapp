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

Wait for Authentik to finish initialising at [http://localhost:9090](http://localhost:9090) before starting the webapp.

### 2. Configure the webapp

Copy the example env file and adjust if needed:

```bash
cp .docker/.env.example .docker/.env   # edit NEXTAUTH_SECRET, client credentials, etc.
```

The defaults in `docker-compose.yml` match the dev values provisioned by the firebim-api-server Authentik blueprint, so no changes are required for a standard local setup.

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

