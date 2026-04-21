package http

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	internalauth "github.com/wallet-portal/policy-engine/internal/auth"
	"github.com/wallet-portal/policy-engine/internal/service"
	"github.com/wallet-portal/policy-engine/internal/telemetry"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
)

// NewRouter builds the chi router with all middleware and routes registered.
//
// Middleware stack (outermost → innermost):
//   - Recoverer    — catches panics, returns 500
//   - RequestID    — attaches X-Request-Id to every request
//   - zerolog      — structured per-request log line (includes trace_id/span_id)
//   - BearerAuth   — D4 shared-secret gate (all non-health routes)
//
// pool is injected so ReadyHandler can perform a real DB ping.
func NewRouter(eval *service.Evaluator, bearerToken string, pool *pgxpool.Pool) http.Handler {
	r := chi.NewRouter()

	// Global middleware.
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(zerologMiddleware())
	r.Use(prometheusMiddleware())

	// Health probes — no auth required (used by docker-compose / k8s probes).
	r.Get("/health/live", LiveHandler)
	r.Get("/health/ready", ReadyHandler(pool))

	// Prometheus metrics — unauthenticated (scraped by Prometheus on internal network only).
	metricsHandler := promhttp.HandlerFor(telemetry.Registry, promhttp.HandlerOpts{Registry: telemetry.Registry})
	r.Get("/metrics", metricsHandler.ServeHTTP)

	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(internalauth.BearerMiddleware(bearerToken))

		// Primary evaluation endpoint (spec names it both /evaluate and /v1/check —
		// register both; /v1/check is the canonical path per the prompt).
		r.Post("/v1/check", EvaluateHandler(eval))
		r.Post("/evaluate", EvaluateHandler(eval)) // legacy alias
	})

	return r
}

// zerologMiddleware returns a chi-compatible middleware that logs each request
// with method, path, status, latency, and OTel trace_id/span_id via zerolog.
func zerologMiddleware() func(http.Handler) http.Handler {
	tracer := otel.Tracer("policy-engine/http")
	_ = tracer // tracer available for future manual spans; span IDs come from otelhttp wrapper

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

			defer func() {
				event := log.Logger.WithLevel(logLevel(ww.Status())).
					Str("method", r.Method).
					Str("path", r.URL.Path).
					Str("request_id", middleware.GetReqID(r.Context())).
					Int("status", ww.Status()).
					Dur("duration_ms", time.Since(start))

				// Inject OTel trace/span IDs if a span is active in the context
				if span := trace.SpanFromContext(r.Context()); span.SpanContext().IsValid() {
					sc := span.SpanContext()
					event = event.
						Str("trace_id", sc.TraceID().String()).
						Str("span_id", sc.SpanID().String())
				}

				event.Msg("request")
			}()

			next.ServeHTTP(ww, r)
		})
	}
}

// logLevel maps HTTP status to an appropriate zerolog level.
func logLevel(status int) zerolog.Level {
	switch {
	case status >= 500:
		return zerolog.ErrorLevel
	case status >= 400:
		return zerolog.WarnLevel
	default:
		return zerolog.InfoLevel
	}
}

// prometheusMiddleware records HTTP request count and duration using the
// shared Prometheus registry. Skip the /metrics path itself to avoid
// self-referential cardinality.
func prometheusMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/metrics" {
				next.ServeHTTP(w, r)
				return
			}

			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)

			durationSec := time.Since(start).Seconds()
			labels := []string{r.Method, r.URL.Path, http.StatusText(ww.Status())}
			telemetry.HTTPRequestsTotal.WithLabelValues(labels...).Inc()
			telemetry.HTTPRequestDurationSeconds.WithLabelValues(labels...).Observe(durationSec)
		})
	}
}
