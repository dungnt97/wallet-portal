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

	"github.com/wallet-portal/policy-engine/internal/config"
	"github.com/wallet-portal/policy-engine/internal/db"
	internalhttp "github.com/wallet-portal/policy-engine/internal/http"
	"github.com/wallet-portal/policy-engine/internal/service"
)

func main() {
	// ── Config ────────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		// Use stdlib logger before zerolog is set up.
		log.Fatal().Err(err).Msg("failed to load config")
	}

	// ── Logging ───────────────────────────────────────────────────────────────
	level, err := zerolog.ParseLevel(cfg.LogLevel)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)
	zerolog.TimeFieldFormat = time.RFC3339
	log.Logger = log.Output(os.Stdout)

	log.Info().
		Str("port", cfg.Port).
		Str("log_level", level.String()).
		Msg("policy-engine starting")

	// ── DB pool ───────────────────────────────────────────────────────────────
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create DB pool")
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatal().Err(err).Msg("failed to ping database")
	}
	log.Info().Msg("database connected")

	// ── Service wiring ────────────────────────────────────────────────────────
	queries := db.New(pool)
	eval := service.New(queries, service.DefaultRules())

	// ── HTTP server ───────────────────────────────────────────────────────────
	router := internalhttp.NewRouter(eval, cfg.SvcBearerToken)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown: wait for SIGINT/SIGTERM then give in-flight requests 10s.
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
