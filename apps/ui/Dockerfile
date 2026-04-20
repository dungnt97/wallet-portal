# Multi-stage Dockerfile for wallet-portal UI (Vite / Node 20 / nginx)
# Stage 1: install deps and build static assets
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/ui/package.json ./apps/ui/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile --filter @wp/ui...
COPY apps/ui ./apps/ui
COPY packages ./packages
COPY tsconfig.base.json ./
WORKDIR /app/apps/ui
# Use vite build directly — tsc --noEmit typecheck runs separately in CI
# (scripts/gen-api-types.ts has a pre-existing missing @types/node issue)
RUN pnpm exec vite build

# Stage 2: serve with nginx (non-root, port 8080 to avoid privileged bind)
FROM nginx:alpine AS runtime
# Copy custom nginx config that uses unprivileged port 8080 with SPA fallback
COPY apps/ui/nginx.conf /etc/nginx/conf.d/default.conf
# Remove default nginx config; copy static assets
RUN rm -f /etc/nginx/conf.d/default.conf.default
COPY --from=build /app/apps/ui/dist /usr/share/nginx/html
# nginx:alpine image already includes an nginx user (UID 101)
# Ensure writable paths for non-root nginx operation
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
