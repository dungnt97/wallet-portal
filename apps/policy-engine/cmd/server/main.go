// Command policy-engine is the entry point for the custody policy gating service.
// It exposes a single HTTP endpoint (POST /v1/check) that evaluates pre-sign
// withdrawal requests against a set of configurable rules.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/wallet-portal/policy-engine/internal/config"
	"github.com/wallet-portal/policy-engine/internal/db"
	internalhttp "github.com/wallet-portal/policy-engine/internal/http"
	"github.com/wallet-portal/policy-engine/internal/service"
	"github.com/wallet-portal/policy-engine/internal/telemetry"
)

func main() {
	// ── Config ────────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	// ── Logging ───────────────────────────────────────────────────────────────
	level, err := zerolog.ParseLevel(cfg.LogLevel)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)
	zerolog.TimeFieldFormat = time.RFC3339
	// JSON output always (zerolog default is JSON; add trace_id via hook below)
	log.Logger = log.Output(os.Stdout).With().
		Str("service", "policy-engine").
		Logger()

	log.Info().
		Str("port", cfg.Port).
		Str("log_level", level.String()).
		Msg("policy-engine starting")

	// ── OpenTelemetry ─────────────────────────────────────────────────────────
	ctx := context.Background()
	otelShutdown, err := telemetry.Setup(ctx)
	if err != nil {
		log.Warn().Err(err).Msg("OTel setup failed — continuing without tracing")
	} else {
		defer func() {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := otelShutdown(shutdownCtx); err != nil {
				log.Error().Err(err).Msg("OTel shutdown error")
			}
		}()
	}

	// ── DB pool ───────────────────────────────────────────────────────────────
	dbCtx, dbCancel := context.WithTimeout(ctx, 10*time.Second)
	defer dbCancel()

	pool, err := pgxpool.New(dbCtx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create DB pool")
	}
	defer pool.Close()

	if err := pool.Ping(dbCtx); err != nil {
		log.Fatal().Err(err).Msg("failed to ping database")
	}
	log.Info().Msg("database connected")

	// ── Service wiring ────────────────────────────────────────────────────────
	queries := db.New(pool)
	eval := service.New(queries, service.DefaultRules(cfg.PolicyDevMode))

	// ── HTTP server — wrapped with OTel HTTP middleware ───────────────────────
	// Pool is passed to the router so ReadyHandler can ping DB on each probe.
	router := internalhttp.NewRouter(eval, cfg.SvcBearerToken, pool)

	// otelhttp wraps the entire router: creates a span per request and propagates
	// W3C TraceContext headers from incoming requests.
	tracedHandler := otelhttp.NewHandler(router, "policy-engine",
		otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string {
			return r.Method + " " + r.URL.Path
		}),
	)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      tracedHandler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// ── Graceful shutdown ─────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Info().Str("addr", srv.Addr).Msg("HTTP server listening")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("HTTP server error")
		}
	}()

	<-quit
	log.Info().Msg("shutting down gracefully…")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("server forced to shutdown")
	}

	log.Info().Msg("policy-engine stopped")
}
