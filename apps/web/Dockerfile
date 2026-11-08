# Production image for the web app. Build from the repository root, as CI does:
#   docker build --file apps/web/Dockerfile .

# node:22.23.4-alpine
FROM node:22-alpine@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202 AS build
WORKDIR /repo
# Only the manifests first, so the dependency layer is cached across source edits.
# .npmrc carries ignore-scripts=true: no dependency runs code at install time.
COPY package.json package-lock.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @yoman/web --include-workspace-root=false
COPY tsconfig.base.json ./
COPY packages/shared/src/ packages/shared/src/
COPY apps/web/index.html apps/web/vite.config.ts apps/web/tsconfig.json apps/web/
COPY apps/web/src/ apps/web/src/
RUN npm run build --workspace @yoman/web

# nginxinc/nginx-unprivileged:1.30.6 stable-alpine
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
COPY apps/web/nginx/nginx.conf /etc/nginx/nginx.conf
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /repo/apps/web/dist/ /usr/share/nginx/html/
USER 101:101
EXPOSE 8080
# Skip the stock entrypoint: its scripts rewrite files under /etc/nginx, which the
# read-only root filesystem forbids, and none of them is needed here.
ENTRYPOINT ["nginx", "-g", "daemon off;"]
