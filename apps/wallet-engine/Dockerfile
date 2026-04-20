# Multi-stage Dockerfile for wallet-engine (Node 20 / Alpine)
# Stage 1: install ALL deps (needed for build tools like tsx, tsc)
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/wallet-engine/package.json ./apps/wallet-engine/
COPY apps/admin-api/package.json ./apps/admin-api/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile --filter @wp/wallet-engine...

# Stage 2: build source
FROM deps AS build
COPY apps/wallet-engine ./apps/wallet-engine
COPY apps/admin-api ./apps/admin-api
COPY packages ./packages
COPY tsconfig.base.json ./
RUN pnpm --filter @wp/wallet-engine build 2>/dev/null || true

# Stage 3: runtime — non-root user, minimal surface
# Use full deps install because tsx (devDep) is required at runtime for --import tsx/esm.
# Post-MVP: compile to JS and eliminate tsx for smaller images.
FROM node:20-alpine AS runtime
# Install curl for HEALTHCHECK only
RUN apk add --no-cache curl
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
# Create non-root user
RUN addgroup -g 1001 -S app && adduser -u 1001 -S app -G app
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --from=deps --chown=app:app /app/apps/wallet-engine/node_modules ./apps/wallet-engine/node_modules
COPY --from=build --chown=app:app /app/apps/wallet-engine ./apps/wallet-engine
COPY --from=build --chown=app:app /app/apps/admin-api ./apps/admin-api
COPY --from=build --chown=app:app /app/packages ./packages
COPY --chown=app:app package.json pnpm-workspace.yaml ./

USER app
WORKDIR /app/apps/wallet-engine
ENV NODE_ENV=production
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3002/health/live || exit 1
CMD ["node", "--import", "tsx/esm", "src/server.ts"]
