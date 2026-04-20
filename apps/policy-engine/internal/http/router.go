package http

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	internalauth "github.com/wallet-portal/policy-engine/internal/auth"
	"github.com/wallet-portal/policy-engine/internal/service"
)

// NewRouter builds the chi router with all middleware and routes registered.
//
// Middleware stack (outermost → innermost):
//   - Recoverer    — catches panics, returns 500
//   - RequestID    — attaches X-Request-Id to every request
//   - zerolog      — structured per-request log line
//   - BearerAuth   — D4 shared-secret gate (all non-health routes)
func NewRouter(eval *service.Evaluator, bearerToken string) http.Handler {
	r := chi.NewRouter()

	// Global middleware.
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(zerologMiddleware())

	// Health probes — no auth required (used by docker-compose / k8s probes).
	r.Get("/health/live", LiveHandler)
	r.Get("/health/ready", ReadyHandler)

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
// with method, path, status, and latency via zerolog.
func zerologMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

			defer func() {
				log.Logger.WithLevel(logLevel(ww.Status())).
					Str("method", r.Method).
					Str("path", r.URL.Path).
					Str("request_id", middleware.GetReqID(r.Context())).
					Int("status", ww.Status()).
					Dur("duration_ms", time.Since(start)).
					Msg("request")
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
