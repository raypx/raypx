# API Service

A standalone Hono API service providing authentication, RPC, and webhook functionality.

## Features

- **Auth**: `/api/auth/*` - Better-auth handler
- **RPC**: `/api/rpc/*` - oRPC handler
- **Webhooks**: `/api/webhooks/stripe` - Stripe webhook handler
- **Health**: `/health`, `/api/health` - Health check endpoints

## Development

```bash
# Start the API service
bun dev:api

# Or run directly
cd apps/api
bun run dev
```

Default port: `3001` (configurable via `PORT` env var)

## Build

```bash
# Build the API service
cd apps/api
bun run build

# The bundled output will be in dist/index.js
```

The build uses `tsdown` to bundle TypeScript into a single ESM file optimized for Node.js/Bun runtime.

## Environment Variables

Required environment variables:

- `PORT` - Server port (default: 3001)
- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SECRET` - Better-auth secret key
- `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` - GitHub OAuth credentials
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` - Google OAuth credentials
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Stripe configuration
- `RESEND_API_KEY`, `RESEND_FROM` - Email service configuration
- `VITE_AUTH_URL` - Auth service base URL

## CORS

Allowed origins by default:
- `http://localhost:3000`
- `http://localhost:5173`
- `https://raypx.com`
- `https://docs.raypx.com`

Modify CORS configuration in `src/index.ts` if needed.

## Deployment

### Docker

The Dockerfile uses a multi-stage build:
1. Builds the TypeScript code with `tsdown` into `dist/index.js`
2. Copies only the built file and production dependencies
3. Runs the bundled file with Bun

```bash
docker build -f apps/api/Dockerfile -t api .
docker run -p 3001:3001 api
```

### Railway / Fly.io / Render

Run `bun run src/index.ts` directly. Make sure all required environment variables are set.
