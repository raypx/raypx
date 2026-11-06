# syntax=docker/dockerfile:1
# Core policy/transport checks; GUI and installers require the selected native runners.
FROM rust:1.99.1-bookworm AS checks
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY apps/desktop/src-tauri ./apps/desktop/src-tauri
COPY apps/desktop/generated ./apps/desktop/generated
COPY apps/desktop/tests/fixtures/native ./apps/desktop/tests/fixtures/native
RUN cargo test --locked -p raypx-desktop --no-default-features --features native-smoke
