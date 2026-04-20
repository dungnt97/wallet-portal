# Multi-stage build: compile in full Go image, copy binary to minimal runtime.
# Stage 1 — builder
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Cache dependency downloads separately from source compilation.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/policy-engine ./cmd/server/

# Stage 2 — runtime (distroless-equivalent using scratch)
FROM scratch

# Import CA certs so TLS connections to Postgres work.
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

COPY --from=builder /app/bin/policy-engine /policy-engine

EXPOSE 3003

ENTRYPOINT ["/policy-engine"]
