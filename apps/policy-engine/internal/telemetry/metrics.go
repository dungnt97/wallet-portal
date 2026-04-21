// Package telemetry — Prometheus metrics registry for policy-engine.
// Exposes default Go process metrics plus application-level counters/gauges.
// Mount GET /metrics in the router to scrape.
package telemetry

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
)

// Registry is the single Prometheus registry used by policy-engine.
// All metrics are registered here so the /metrics handler can expose them.
var Registry = prometheus.NewRegistry()

// ── Application-level metrics ────────────────────────────────────────────────

// PolicyDecisionsTotal counts policy evaluation outcomes.
// Labels: rule (rule name), result (allow|deny).
var PolicyDecisionsTotal = prometheus.NewCounterVec(
	prometheus.CounterOpts{
		Name: "policy_decisions_total",
		Help: "Total policy evaluation decisions broken down by rule and result.",
	},
	[]string{"rule", "result"},
)

// KillSwitchEnabled tracks the current kill-switch state as a gauge.
// Value is 1.0 when enabled, 0.0 when disabled.
// Updated on each /v1/check call via the cached kill-switch value.
var KillSwitchEnabled = prometheus.NewGauge(
	prometheus.GaugeOpts{
		Name: "wallet_portal_kill_switch_enabled",
		Help: "1 when the global kill-switch is active (all withdrawals/sweeps blocked), 0 otherwise.",
	},
)

// HTTPRequestsTotal counts HTTP requests by method, route, and status code.
var HTTPRequestsTotal = prometheus.NewCounterVec(
	prometheus.CounterOpts{
		Name: "http_server_requests_total",
		Help: "Total number of HTTP requests handled by policy-engine.",
	},
	[]string{"method", "route", "status_code"},
)

// HTTPRequestDurationSeconds records HTTP request latency.
var HTTPRequestDurationSeconds = prometheus.NewHistogramVec(
	prometheus.HistogramOpts{
		Name:    "http_server_request_duration_seconds",
		Help:    "HTTP request duration in seconds.",
		Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
	},
	[]string{"method", "route", "status_code"},
)

func init() {
	// Default Go runtime + process metrics
	Registry.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)

	// Application metrics
	Registry.MustRegister(
		PolicyDecisionsTotal,
		KillSwitchEnabled,
		HTTPRequestsTotal,
		HTTPRequestDurationSeconds,
	)
}
