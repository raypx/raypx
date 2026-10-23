# Existing beta environment

Beta and production are independent projects using the same
[deployment scripts](deployment.md): `deploy/build.sh`, `deploy/compose.yaml` and
`deploy/.env.example`. Each project receives its own environment variables.

## Adopting the common files

The original `deploy/beta/` files moved to `deploy/`. Replace `BETA_HOST` with
`APP_HOST`. Use the existing Dokploy service's exact `appName` as
`COMPOSE_PROJECT_NAME`; preserve it for every update.

For the original beta database, explicitly keep `POSTGRES_DB=raypx_beta` and
`POSTGRES_VOLUME_NAME=raypx-beta-postgres`. This adopts the existing named storage.
New projects leave the volume override empty and get project-scoped storage.
Back up configuration and the database before changing the Compose configuration.

New image tags use `<compose-project>-<release>`. Build the new tags, or explicitly
alias old images after verifying they were built for the same hostname and source
version. For example, original `beta-20261024-01` images can keep source version
`20261024-01` under the existing Compose project's image prefix.

To keep the original bounded builder and caches, set
`RAYPX_BUILD_BUILDER=raypx-beta-builder` on that host. The shared default for new
hosts is `raypx-builder`. Hostnames, credentials and storage are explicit values;
the scripts do not infer or migrate existing resources.
