# firebim-webapp — Copilot Instructions

## Purpose
Frontend for firebim-api-server.
The backend API is in a separate repo (firebim-api-server).

## Tech Stack
- **Framework**: Next.js 15 (Pages Router)
- **Language**: TypeScript (strict)
- **Auth**: NextAuth v4 with Authentik OIDC provider
- **Data fetching**: TanStack Query v5
- **HTTP client**: Axios (via `src/utils/api-client.ts`)
- **Forms**: React Hook Form + Zod validation
- **Styling**: Tailwind CSS v4 + Headless UI
- **Package manager**: pnpm 10 (never use npm or yarn)
- **CI/CD**: GitHub Actions

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
