# firebim-webapp — Copilot Instructions

## Purpose
Frontend for firebim-api-server.
The backend API is in a separate repo (firebim-api-server).

## Tech Stack
- **Framework**: Next.js 16 (Pages Router)
- **Language**: TypeScript (strict)
- **Auth**: NextAuth v4 with Authentik OIDC provider
- **Data fetching**: TanStack Query v5
- **HTTP client**: Axios (via `src/utils/api-client.ts`)
- **Forms**: React Hook Form + Zod validation
- **Styling**: Tailwind CSS v4 + Headless UI
- **Package manager**: pnpm 10 (never use npm or yarn)
- **CI/CD**: GitHub Actions

## Local development
- Prefer Docker on Windows when validating behavior that will deploy to Linux.
- Start the backend stack first from the sibling `firebim-api-server` repo with `docker compose up -d`.
- The webapp Compose file expects the backend Docker network to be `firebim-api-server_default` unless `FIREBIM_API_NETWORK` is set.
- For lexicon-oriented local stacks, the backend network is often `firebim_api_server_lexicon_default`; set `FIREBIM_API_NETWORK=firebim_api_server_lexicon_default` before `make up-build`.
- Docker runtime should use `API_BACKEND_URL=http://api:8000`, with browser API calls still going through `/api/proxy/...`.
- `.env.local` is for local `pnpm` development. `.docker/.env` only provides build-time placeholders for public Next.js variables.
- `/api/health` has a short upstream timeout. If it reports `degraded`, verify the backend directly at `http://localhost:8000/health` or from the webapp container with `http://api:8000/health` before assuming the network is broken.

## Conventions
- All components use TypeScript — no `any`, no implicit types
- Pages live in `src/pages/`, shared components in `src/components/`
- API types are generated from `openapi.json` into `src/types/api.ts` — never hand-edit that file
- Use the shared Axios instance from `src/utils/api-client.ts` for all backend calls
- Authentication state comes from `src/contexts/AuthContext.tsx` via `useSession`
- All API calls go through the Next.js proxy at `/api/proxy/[...path].ts` — never call the backend directly from the browser
- Environment variables for all configuration — never hardcode secrets or URLs

## API Type Generation
After updating `openapi.json`, regenerate types:
```bash
make generate-api
# or
pnpm generate:api
```

## Pre-commit checklist
```bash
pnpm format      # oxfmt — format source files
pnpm lint        # oxlint
pnpm build       # TypeScript compile + Next.js build
```

## Key Patterns
- JWT session tokens are refreshed automatically by NextAuth
- The proxy route (`src/pages/api/proxy/[...path].ts`) forwards requests server-side, attaching the bearer token
- `src/contexts/QueryProvider.tsx` wraps the app with TanStack Query client
