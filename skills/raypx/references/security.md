# Rate limiting and security headers

## Rate limits (production)

- Better Auth stores limits in the PostgreSQL `rate_limit` table, so Node processes
  and Worker isolates share them. Built-in rules: sign-in/sign-up 3 per 10 s,
  verification and reset mail 3 per 60 s, other auth routes 100 per 60 s, per client IP.
- Client IP: the Node entry overwrites `x-raypx-client-ip` with the socket address and
  uses it by default; Workers use `cf-connecting-ip`. Behind a proxy set
  `AUTH_IP_HEADERS` (e.g. `x-forwarded-for`) and `AUTH_TRUSTED_PROXIES`, otherwise all
  clients share the proxy's bucket. Unresolvable addresses share one bucket by design.
- With `REDIS_URL` (Node only) Better Auth and RPC limits use Redis/Valkey counters
  instead of the table, and sessions are cached there too.
- `apps/api/server/rate-limit.ts` limits RPC procedures per account in the same table:
  `devices.register` 10/min, `devices.refreshGrant` 30/min, `relay.ticket` 60/min.
  Rejections are `TOO_MANY_REQUESTS` with code `RATE_LIMITED`, translated in UI.
  Add a procedure to `rpcLimits` in `server/api.ts`; keep windows at or below 60 s.

## Security headers

- API (`hono/secure-headers`): `default-src 'none'; frame-ancestors 'none'`,
  `X-Frame-Options: DENY`, HSTS, nosniff, `Referrer-Policy: no-referrer`.
  Cross-Origin-Resource-Policy is off because Web and Desktop read through CORS.
- Web (Nitro route rules in `apps/web/vite.config.ts`): CSP limited to
  `frame-ancestors`, `object-src`, `base-uri` and `form-action`, plus HSTS, nosniff,
  `strict-origin-when-cross-origin` referrers and a Permissions-Policy.
- Restricting `script-src` needs per-request nonces for the inline hydration and theme
  scripts; it is not done yet.

## CORS

Hono `cors` in `apps/api/server/api.ts` covers `/rpc/*`, `/api/auth/*` and `/health`:
exact `ALLOWED_ORIGINS` (Web, `views://main`, `raypx://`), credentials, GET/HEAD/POST,
and a ten-minute preflight cache. oRPC's `CORSHandlerPlugin` would duplicate it; keep
one CORS layer.
