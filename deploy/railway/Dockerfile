FROM caddy:2.11.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f
COPY deploy/railway/Caddyfile /etc/caddy/Caddyfile
RUN API_UPSTREAM=127.0.0.1:3002 WEB_UPSTREAM=127.0.0.1:3000 PORT=8080 \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
    && chown -R 65532:65532 /config /data
USER 65532:65532
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
