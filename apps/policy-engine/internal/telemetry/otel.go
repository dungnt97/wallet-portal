// Package telemetry bootstraps OpenTelemetry tracing and Sentry for policy-engine.
// Call Setup() early in main(), and defer the returned shutdown func.
package telemetry

import (
	"context"
	"fmt"
	"os"
	"time"

	sentry "github.com/getsentry/sentry-go"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// Setup initialises the OTel TracerProvider and Sentry.
// Returns a shutdown function that must be deferred in main().
func Setup(ctx context.Context) (shutdown func(context.Context) error, err error) {
	serviceName := envOrDefault("OTEL_SERVICE_NAME", "policy-engine")
	otlpEndpoint := envOrDefault("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")

	// ── Resource ──────────────────────────────────────────────────────────────
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(serviceName),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("otel resource: %w", err)
	}

	// ── OTLP HTTP trace exporter ──────────────────────────────────────────────
	exp, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpointURL(otlpEndpoint+"/v1/traces"),
		otlptracehttp.WithInsecure(),
	)
	if err != nil {
		return nil, fmt.Errorf("otlp exporter: %w", err)
	}

	// ── Sampler: always-on in dev, 10% parent-based in prod ──────────────────
	var sampler sdktrace.Sampler
	if os.Getenv("NODE_ENV") == "production" {
		sampler = sdktrace.ParentBased(sdktrace.TraceIDRatioBased(0.1))
	} else {
		sampler = sdktrace.AlwaysSample()
	}

	// ── TracerProvider ────────────────────────────────────────────────────────
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sampler),
	)
	otel.SetTracerProvider(tp)

	// ── Propagator: W3C TraceContext + Baggage ─────────────────────────────
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	// ── Sentry (noop if DSN empty) ────────────────────────────────────────────
	if dsn := os.Getenv("SENTRY_DSN"); dsn != "" {
		if err := sentry.Init(sentry.ClientOptions{
			Dsn:              dsn,
			Environment:      envOrDefault("NODE_ENV", "development"),
			TracesSampleRate: 0.1,
		}); err != nil {
			// Non-fatal — log but continue
			fmt.Fprintf(os.Stderr, "[sentry] init error: %v\n", err)
		}
	}

	shutdown = func(ctx context.Context) error {
		sentry.Flush(2 * time.Second)
		return tp.Shutdown(ctx)
	}

	fmt.Printf("[otel] %s telemetry started → %s\n", serviceName, otlpEndpoint)
	return shutdown, nil
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
