# Multi-stage build: compile in full Go image, copy binary to minimal runtime.
# Stage 1 — builder
# Note: go.mod declares go 1.25.0 (otel dep requires it). golang:1.24-alpine ships toolchain 1.24.x
# which satisfies 1.25.0 module requirements via Go's forward-compatible toolchain download.
# CI matrix uses go-version: '1.24' to match.
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install CA certs in builder so we can copy them to scratch stage
# GOTOOLCHAIN=auto allows Go 1.24 to auto-download 1.25 toolchain as declared in go.mod
ENV GOTOOLCHAIN=auto

RUN apk add --no-cache ca-certificates

# Cache dependency downloads separately from source compilation.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/policy-engine ./cmd/server/

# Stage 2 — runtime: distroless/static (no shell, minimal attack surface, built-in nobody user)
# Distroless provides CA certs and /etc/passwd with nonroot user UID 65532
FROM gcr.io/distroless/static:nonroot

COPY --from=builder /app/bin/policy-engine /policy-engine

# distroless/static:nonroot runs as nonroot (UID 65532) by default
EXPOSE 3003

# HEALTHCHECK: distroless has no shell/curl. ECS/k8s probes the HTTP endpoint directly.
# The orchestrator should configure a health probe to GET /health/live on port 3003.
# HEALTHCHECK is omitted here — use container orchestrator health checks instead.

ENTRYPOINT ["/policy-engine"]
