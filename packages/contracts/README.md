# @raypx/contracts

Shared contracts for frontend and backend. Implements health check Zod schema and HealthResponse type. Usable by both browser and server.

Public entrypoint: `@raypx/contracts/health`. Import via package exports, cross-package direct access to src or dist prohibited.

Runtime outputs ESM and TypeScript declarations. Static TypeScript configuration provided by @raypx/tsconfig, tasks provided by @raypx/config; build uses tsconfig.json, source/test/config checks use tsconfig.test.json, task definitions in this package's vite.config.ts.

Author: Zack <heyloyep@gmail.com>
