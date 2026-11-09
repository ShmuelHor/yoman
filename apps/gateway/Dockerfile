# The gateway image (SECURITY A10). Build from the repository root:
#
#   docker build -f apps/gateway/Dockerfile -t yoman-gateway .
#
# docker/Dockerfile.service is not reused: it is keyed on services/<name>, runs
# dist/main.js and probes with service-kit, while the gateway lives under apps/
# and has its own healthcheck. The hardening steps are the same.

# node:22-alpine, pinned to the multi-arch index digest.
ARG NODE_IMAGE=node:22-alpine@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202

FROM ${NODE_IMAGE} AS build
WORKDIR /app

# Only the manifests, the shared packages and the gateway: no .env, no other app.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/ packages/
COPY apps/gateway/ apps/gateway/

# Install scripts never run. A local node_modules or dist must not leak in.
RUN find packages apps \( -name node_modules -o -name dist \) -prune -exec rm -rf {} + \
  && npm ci --ignore-scripts --no-audit --no-fund \
  && npm run build --workspaces --if-present \
  && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime

# npm, corepack and yarn are build tools: removing them leaves less to exploit.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
  /usr/local/bin/corepack /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=8080

WORKDIR /app
# Owned by root and not writable by the runtime user.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/packages/ packages/
COPY --from=build /app/apps/gateway/ apps/gateway/

WORKDIR /app/apps/gateway
# Numeric IDs of the base image's `node` user, so runAsNonRoot checks can verify it.
USER 1000:1000
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "/app/apps/gateway/dist/core/healthcheck.js"]

# Node is PID 1; the gateway handles SIGTERM itself.
CMD ["node", "dist/core/main.js"]
