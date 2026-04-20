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
RUN pnpm build

# Stage 2: serve with nginx
FROM nginx:alpine AS runtime
COPY --from=build /app/apps/ui/dist /usr/share/nginx/html
# SPA fallback: all paths serve index.html
RUN printf 'server {\n  listen 5173;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / { try_files $uri $uri/ /index.html; }\n}\n' \
    > /etc/nginx/conf.d/default.conf
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
