# ADR-0006: Optional Redis cache and Better Auth secondary storage

## Status

Accepted for the cache adapter; Auth secondary storage and policy caching are
superseded by [ADR-0016](0016-cloud-agent-platform.md).

## Context

The API currently persists Better Auth state and dynamic authentication policy in
PostgreSQL. Multiple API instances benefit from shared session/rate-limit storage
and a short-lived policy cache, but local development must continue to work without
an external Redis service.

## Decision

Add `@voidmix/cache` as the server-side Redis boundary. It provides the Laravel-like
cache facade and the Better Auth secondary-storage adapter using `ioredis`, with
prefix-scoped keys, atomic consume/counter operations, direct error propagation,
and explicit RESP3 connections with native reply mapping.

`REDIS_URL` is optional. When configured, API runtime injects Better Auth secondary
storage, retains session and verification database persistence, and caches resolved
Auth policy for 30 seconds. A successful Auth settings update deletes that policy
key; invalidation failures are returned to the caller. When Redis is absent, the
runtime uses the existing database-only behavior.

## Consequences

Redis is required only for the deployments that choose shared secondary storage;
there is no hidden in-memory fallback. Auth policy changes converge immediately
after successful invalidation, while a cache hit avoids repeated policy reads. Admin
presentation data, mail readiness, and secrets remain outside the cache.

## Follow-up

Revisit the optional-Redis policy if production deployments require a hard startup
guarantee or if cache stampede protection becomes necessary.
