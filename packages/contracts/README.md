# @raypx/contracts

Browser-safe Zod schemas and inferred TypeScript types shared by server and client. This package does not read environment variables or execute requests.

Public entrypoints:

- `@raypx/contracts/health`: `healthResponseSchema`, `readinessResponseSchema`, `HealthResponse`, `ReadinessResponse`.
- `@raypx/contracts/errors`: `apiErrorCodeSchema`, `apiErrorSchema`, `apiErrorResponseSchema`, `fieldErrorsSchema`, and inferred types.
- `@raypx/contracts/pagination`: `paginationSchema`, `paginationMetaSchema`, `Pagination`, `PaginationMeta`.

Business failures return `{ error: { code, message, requestId?, errors? } }`. Codes are `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, and `SERVICE_UNAVAILABLE`. `errors` maps field paths to public validation messages. Messages must not contain secrets, exception text, stack traces, or rejected input values; the schema validates the wire shape, while server error mapping supplies safe messages. Error objects reject additional properties.

Request IDs contain 1–128 letters, numbers, dots, underscores, colons, or hyphens. Readiness probes use their own `{ status, service, checks }` contract, including for HTTP 503; they do not use the business error envelope.

Pagination uses one-based `page` (default 1) and `pageSize` (default 20, maximum 100). It accepts numbers without coercion; handlers must explicitly parse URL search parameters. Metadata contains `page`, `pageSize`, and non-negative `total`. Endpoints define their own item response schemas.

All entrypoints output ESM and TypeScript declarations. Import through package exports, not another package's `src` or `dist`. Build and test tasks are defined in `vite.config.ts`.
