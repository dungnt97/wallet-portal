// Package http wires the chi router, middleware, and all HTTP handlers.
package http

import (
	"encoding/json"
	"net/http"
)

// LiveHandler responds to GET /health/live — confirms the process is running.
func LiveHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// ReadyHandler responds to GET /health/ready — confirms DB connectivity.
// The DB ping is done via the context passed from the server startup; a
// lightweight approach for MVP (no pool.Ping injected here — always 200).
//
// TODO(phase-10): inject pgxpool and call pool.Ping(ctx) for a real readiness check.
func ReadyHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
}
