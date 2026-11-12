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

For Docker development, `.docker/.env` is a build-time placeholder file for public Next.js variables. Runtime values are supplied by `docker-compose.yml`.

By default, `docker-compose.yml` matches the standard local FireBIM stack and joins the backend network `firebim_api_server_lexicon_default`. If your backend project uses another network name, set `FIREBIM_API_NETWORK` before starting the webapp:

```bash
FIREBIM_API_NETWORK=firebim_api_server_lexicon_default make up-build
```

On Windows PowerShell:

```powershell
$env:FIREBIM_API_NETWORK = 'firebim_api_server_lexicon_default'
make up-build
```

The standard local runtime values are:

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

### Health checks

`/api/livez` is the Kubernetes liveness/readiness path: it always returns 200 while the Next.js server is serving and does not call the API or Authentik.

`/api/health` is the aggregate health endpoint for humans, blackbox probes and dashboards (local: [http://localhost:3000/api/health](http://localhost:3000/api/health)). Kubernetes probes must not use it. It checks the API's `/health` and Authentik's OIDC discovery document concurrently, and returns 200 `ok` or 503 `degraded` with each check's result and latency:

```json
{
  "status": "ok",
  "checks": {
    "api": { "status": "ok", "latency_ms": 2140 },
    "authentik": { "status": "ok", "latency_ms": 38 }
  }
}
```

A check's `status` is `ok`, `not configured` (Authentik without an issuer URL, counts as healthy), `error: HTTP <code>`, `error: timeout after <n> ms` or `error: unreachable`.

| Env var | Default | Meaning |
|---------|---------|---------|
| `HEALTH_API_TIMEOUT_MS` | `8000` | Max wait for the API's `/health`, which itself checks the database, S3, Celery and Authentik and can take several seconds |

The Authentik discovery check times out after 5 s. If the API check reports a timeout even though the backend is reachable, test the backend directly with:

```bash
curl http://localhost:8000/health
```

If the webapp container is attached to the backend Docker network, this should also work from inside the container:

```bash
docker exec <webapp-container> node -e "fetch('http://api:8000/health').then(async r => console.log(r.status, await r.text()))"
```

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

Server-side NextAuth callbacks and the proxy route reach the backend and Authentik directly via the Docker network. The browser-facing Authentik issuer stays on `localhost:9080`, with `extra_hosts` allowing the container to resolve that host binding when needed.

### API proxy

`/api/proxy/…` streams request and response bodies, adds the user's bearer token, forwards `X-Forwarded-For`, `X-Request-ID` and `traceparent`/`tracestate`, and mirrors `Retry-After`, `X-RateLimit-*` and `X-Request-ID` back to the browser. It only ever calls `API_BACKEND_URL`. Optional limits:

| Env var | Default | Meaning |
|---------|---------|---------|
| `API_PROXY_TIMEOUT_MS` | `120000` | Max wait for the API's response headers, counted after the request body has been sent (slow uploads don't use it up) → 504 `UPSTREAM_TIMEOUT` |
| `API_PROXY_MAX_BODY_BYTES` | `524288000` (500 MiB) | Max request body → 413 `PAYLOAD_TOO_LARGE` |

### Telemetry

The Next.js server is traced with OpenTelemetry (`src/instrumentation.ts`), configured by the standard `OTEL_*` env vars: `OTEL_EXPORTER_OTLP_ENDPOINT` (or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`), `OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_SERVICE_NAME` (default `firebim-webapp`), `OTEL_RESOURCE_ATTRIBUTES`, `OTEL_TRACES_SAMPLER`/`OTEL_TRACES_SAMPLER_ARG` and `OTEL_SDK_DISABLED`. Without an OTLP endpoint, telemetry is a complete no-op. In Kubernetes these come from the `firebim-otel` ConfigMap.

## Rule Features

The webapp also includes two authenticated rule-focused areas:

* `RuleBuilder` for assembling rule elements, connecting decision flows, and publishing rules
* `RuleBook` for loading graphs, checking rule compatibility, running diagnostics, and inspecting graph execution

Both features follow the same Authentik/NextAuth setup and proxy-based API access as the rest of the application.

## Ontologies page (registry sync)

`/ontologies` lets a signed-in user pull ontology releases from the public FireBIM registry
(https://firebim.org/documentation/ontologies/index.json — no credentials needed) into the connected
API. It calls `POST /ontologies/sync/preview` to compare the registry with the local ontology store and
`POST /ontologies/sync` to publish the missing versions (all new, or a selection). Another registry that
serves the same index format can be entered as the source URL.
