FROM caddy:2.11.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f
ARG VITE_APP_RELEASE
ARG RAILWAY_GIT_COMMIT_SHA
COPY infra/railway/Caddyfile /etc/caddy/Caddyfile
RUN revision="${VITE_APP_RELEASE:-$RAILWAY_GIT_COMMIT_SHA}" \
    && test -n "$revision" && test "${#revision}" -le 200 \
    && case "$revision" in *[!a-zA-Z0-9._-]*) exit 1;; esac \
    && sed -i "s/__RAYPX_BUILD_REVISION__/$revision/g" /etc/caddy/Caddyfile
RUN API_UPSTREAM=127.0.0.1:3002 WEB_UPSTREAM=127.0.0.1:3000 PORT=8080 \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
    && chown -R 65532:65532 /config /data
USER 65532:65532
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
