# Production deployment

`https://raypx.pro` is managed by the Raypx production Compose service in Dokploy.
It uses the same [deployment files](deployment.md) as Beta.

- Compose project: `raypx-prod-6yiunf`.
- Database: `raypx`, user `raypx`.
- Persistent volume: `raypx-prod-6yiunf_postgres`.
- Protected host configuration: `/opt/raypx/private/.env` (`0600`).
- Versioned source: `/opt/raypx/releases/<release>`.
- Configuration and database backups: `/opt/raypx/backups/<release>` (`0700`).

Keep these identifiers stable across deployments. Production has independent
database and authentication secrets. Its database is a new foundation database;
Beta and retired product data are not imported or migrated.

Release from a verified `canary` commit. Build the migration, API and Web images
for `APP_HOST=raypx.pro` and the exact Compose project name before changing the
service's `RAYPX_RELEASE`. Back up the database before migrations. The host can
reuse the bounded `raypx-beta-builder` and its caches; stop it after building.
Deploy through the existing Dokploy Compose service without replacing volumes.

Verify the origin certificate as well as public HTTPS, `/health`, `/ready`,
signed-out redirects, secure session cookies, real login and WebSocket relay.
The opt-in native and browser gates described in [testing](testing.md) accept
`https://raypx.pro` through their explicit HTTPS settings despite their `beta`
command names. Use a dedicated acceptance account and remove it after testing.

Mail requires an explicitly configured `RESEND_API_KEY` and verified `MAIL_FROM`.
Until configured, registration verification and password-reset mail remain
unavailable behind the `MAIL_NOT_CONFIGURED` guard. Existing-account login is
independent of mail availability; never bypass verification for real users.

Desktop defaults to this production origin. Existing installations can retain a
Beta or self-hosted profile in `~/.raypx/config.toml`; deployment does not change
their selection. See [Desktop configuration](desktop-configuration.md).
