# syntax=docker/dockerfile:1
# Builds the docs (with encrypted admin pages) and serves them with nginx.
# Used by the optional `docs` service in docker-compose.yml (COMPOSE_PROFILES=docs).

FROM node:22-alpine AS build
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
# Flaky networks: npm waits 5 minutes on a stalled download by default, so give up on one
# after 60 s and retry it, with fewer parallel connections. As a last resort, a whole
# attempt that still hangs is killed after 8 minutes and started again. The download cache
# survives between builds and attempts, so a retry only fetches what's missing.
# Low-memory CTs: see scripts/update.sh.
ENV npm_config_fetch_timeout=60000 \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=10000 \
    npm_config_fetch_retry_maxtimeout=60000 \
    npm_config_maxsockets=6
RUN --mount=type=cache,target=/root/.npm \
    for attempt in 1 2 3; do \
        timeout 480 npm ci --no-fund --no-audit --prefer-offline && exit 0; \
        echo "npm ci failed or stalled (attempt $attempt of 3); retrying" >&2; \
        sleep 10; \
    done; \
    exit 1
COPY . .
# The admin password arrives as a build secret: it is never stored in a layer or the image.
# Without it, scripts/protect-admin.mjs fails the build rather than publish unencrypted pages.
RUN --mount=type=secret,id=docs_admin_password,env=DOCS_ADMIN_PASSWORD npm run build

FROM nginx:1.31-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
