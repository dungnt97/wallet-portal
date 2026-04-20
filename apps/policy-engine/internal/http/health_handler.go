// Package http wires the chi router, middleware, and all HTTP handlers.
package http

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// healthResponse is the JSON body for both live and ready endpoints.
type healthResponse struct {
	Status string `json:"status"`
	DB     string `json:"db,omitempty"`
}

// LiveHandler responds to GET /health/live — confirms the process is running.
func LiveHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(healthResponse{Status: "ok"})
}

// ReadyHandler returns an http.HandlerFunc that pings the DB pool and returns
// 200 when healthy or 503 when the database is unreachable.
// Fixes the TODO from Phase 08 — real pgxpool.Ping injected here.
func ReadyHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()

		dbStatus := "ok"
		if err := pool.Ping(ctx); err != nil {
			dbStatus = "error"
		}

		w.Header().Set("Content-Type", "application/json")
		if dbStatus == "error" {
			w.WriteHeader(http.StatusServiceUnavailable)
		} else {
			w.WriteHeader(http.StatusOK)
		}
		_ = json.NewEncoder(w).Encode(healthResponse{Status: dbStatus, DB: dbStatus})
	}
}
