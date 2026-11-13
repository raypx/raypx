# syntax=docker/dockerfile:1
ARG BUN_IMAGE_DIGEST
ARG COMPUTER_BASE_DIGEST
FROM oven/bun:1.4.4@sha256:${BUN_IMAGE_DIGEST} AS bun
# Operator supplies a verified python:3.13-slim-bookworm manifest digest; no floating fallback.
FROM python:3.13-slim-bookworm@sha256:${COMPUTER_BASE_DIGEST}
RUN apt-get update && apt-get install -y --no-install-recommends coreutils git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 1000 --create-home --shell /bin/sh computer \
    && mkdir -p /home/computer/workspace && chown -R 1000:1000 /home/computer
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY infra/sandbox/src/home.py /opt/raypx/home.py
USER 1000:1000
ENV HOME=/home/computer
WORKDIR /home/computer/workspace
CMD ["sleep", "infinity"]
