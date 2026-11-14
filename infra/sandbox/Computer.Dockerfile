# syntax=docker/dockerfile:1
ARG BUN_IMAGE_DIGEST
ARG COMPUTER_BASE_DIGEST
FROM oven/bun:1.4.4@sha256:${BUN_IMAGE_DIGEST} AS bun
# Operator supplies a verified python:3.13-slim-bookworm manifest digest; no floating fallback.
FROM python:3.13-slim-bookworm@sha256:${COMPUTER_BASE_DIGEST} AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends coreutils git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 1000 --create-home --shell /bin/sh computer \
    && mkdir -p /home/computer/workspace && chown -R 1000:1000 /home/computer \
    && mkdir -p /run/raypx /usage/home /usage/input && chown 1000:1000 /run/raypx && chmod 700 /run/raypx
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY infra/sandbox/src/home.py /opt/raypx/home.py
COPY infra/sandbox/src/usage.py /opt/raypx/usage.py
USER 1000:1000
ENV HOME=/home/computer
WORKDIR /home/computer/workspace
CMD ["sleep", "infinity"]

# Opt-in only: framebuffer and input use local X sockets and Engine exec, never TCP.
FROM runtime AS graphical
USER 0:0
RUN apt-get update && apt-get install -y --no-install-recommends xvfb xdotool openbox netsurf-gtk xterm fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
COPY infra/sandbox/src/screen.py /opt/raypx/screen.py
COPY infra/sandbox/src/screen.html /opt/raypx/screen.html
USER 1000:1000
ARG RAYPX_VALIDATION_ID
LABEL raypx.validation=$RAYPX_VALIDATION_ID

# The default image intentionally keeps all graphical packages out.
FROM runtime AS default
ARG RAYPX_VALIDATION_ID
LABEL raypx.validation=$RAYPX_VALIDATION_ID
