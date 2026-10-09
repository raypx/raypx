# @raypx/api

Server interface handlers. Implements healthResponse and apiNotFoundResponse. No port listening, no Start route dependencies, assembled by apps/web server adapters.

Public entrypoint: `@raypx/api/health`. Import via package exports, cross-package direct access to src or dist prohibited.

Runtime outputs ESM and TypeScript declarations. Static TypeScript configuration provided by @raypx/tsconfig, tasks provided by @raypx/config; build uses tsconfig.json, source/test/config checks use tsconfig.test.json, task definitions in this package's vite.config.ts.

Author: Zack <heyloyep@gmail.com>
