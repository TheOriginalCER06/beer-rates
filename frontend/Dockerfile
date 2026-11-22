# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Flaky networks: give up on a stalled download after 60 s and retry it, with fewer parallel
# connections; a whole attempt that still hangs is killed after 8 minutes and started again.
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
RUN npm run build

FROM nginx:1.31-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-headers-common.conf /etc/nginx/snippets/headers-common.conf
COPY nginx-headers-app.conf /etc/nginx/snippets/headers-app.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
