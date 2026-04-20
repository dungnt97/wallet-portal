# Multi-stage Dockerfile for wallet-engine (Node 20 / Alpine)
# Stage 1: dependencies
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/wallet-engine/package.json ./apps/wallet-engine/
COPY apps/admin-api/package.json ./apps/admin-api/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile --filter @wp/wallet-engine...

# Stage 2: build
FROM deps AS build
COPY apps/wallet-engine ./apps/wallet-engine
COPY apps/admin-api ./apps/admin-api
COPY packages ./packages
COPY tsconfig.base.json ./
RUN pnpm --filter @wp/wallet-engine build 2>/dev/null || true

# Stage 3: runtime
FROM node:20-alpine AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/wallet-engine/node_modules ./apps/wallet-engine/node_modules
COPY --from=build /app/apps/wallet-engine ./apps/wallet-engine
COPY --from=build /app/apps/admin-api ./apps/admin-api
COPY --from=build /app/packages ./packages
COPY package.json pnpm-workspace.yaml ./

WORKDIR /app/apps/wallet-engine
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "--import", "tsx/esm", "src/server.ts"]
