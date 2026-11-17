# syntax=docker/dockerfile:1
ARG BUN_IMAGE_DIGEST
FROM oven/bun:1.4.4@sha256:${BUN_IMAGE_DIGEST} AS bun
FROM bun AS build
WORKDIR /app
COPY . .
RUN VP_GIT_HOOKS=0 bun install --frozen-lockfile --production --filter browser --filter @raypx/core \
  && bun build infra/browser/src/main.ts --target=bun --packages=bundle --outfile=/browser.mjs
FROM bun AS cli
WORKDIR /agent-browser
RUN case "$(uname -m)" in x86_64) platform=x64 ;; aarch64|arm64) platform=arm64 ;; *) exit 1 ;; esac \
  && bun add --ignore-scripts "@agent-browser/cli-linux-${platform}-gnu@0.43.0" \
  && cp "node_modules/@agent-browser/cli-linux-${platform}-gnu/bin/agent-browser" /agent-browser/agent-browser \
  && chmod 755 /agent-browser/agent-browser
FROM bun
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-cjk \
  && apt-get clean
COPY --from=build /browser.mjs /app/browser.mjs
COPY --from=cli /agent-browser/agent-browser /usr/local/bin/agent-browser
ENV RAYPX_BROWSER_CHROME_BIN=/usr/bin/chromium
USER bun
CMD ["bun", "--no-env-file", "/app/browser.mjs"]
