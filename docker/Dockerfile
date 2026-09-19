# --- deps stage (production-only node_modules for the runtime image) -----
FROM node:24-slim AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# --- build stage -----------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run js:build

# --- runtime stage -----------------------------------------------------------
FROM node:24-slim
WORKDIR /app

# ARGs re-declared here — Dockerfile ARG scope ends at the stage that follows a FROM,
# so a value passed at build time only reaches instructions in this stage if repeated.
ARG VERSION=0.0.0-dev
ARG REVISION=unknown

# Python + imagehash worker runtime dependencies.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip gosu \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 1001 appuser

COPY --chown=appuser:appuser scripts/requirements.txt ./scripts/requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r scripts/requirements.txt

COPY --from=deps --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /app/dist ./dist
COPY --chown=appuser:appuser package.json ./
COPY --chown=appuser:appuser VERSION ./
COPY --chown=appuser:appuser scripts/imagehash_worker.py ./scripts/imagehash_worker.py

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

LABEL org.opencontainers.image.title="asset-dedup-image-hash" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION \
      org.opencontainers.image.source="https://codeberg.org/pimbay-svc/asset-dedup-image-hash"

ENV NODE_ENV=production
ENV PYTHON_BIN=python3
ENV IMAGEHASH_WORKER_PATH=/app/scripts/imagehash_worker.py

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

HEALTHCHECK --interval=30s --timeout=3s --retries=5 \
  CMD node dist/presentation/uds/healthcheck.js

CMD ["node", "dist/server.js"]
