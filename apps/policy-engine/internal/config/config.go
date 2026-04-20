// Package config loads policy-engine configuration from environment variables.
package config

import (
	"github.com/kelseyhightower/envconfig"
)

// Config holds all runtime configuration for the policy-engine service.
type Config struct {
	// Port the HTTP server listens on. Default: 3003.
	Port string `envconfig:"PORT" default:"3003"`

	// DatabaseURL is the Postgres connection string (read-only role recommended).
	DatabaseURL string `envconfig:"DATABASE_URL" required:"true"`

	// SvcBearerToken is the shared secret for service-to-service auth (D4).
	// Callers must send: Authorization: Bearer <token>
	SvcBearerToken string `envconfig:"SVC_BEARER_TOKEN" required:"true"`

	// LogLevel controls zerolog level: debug, info, warn, error. Default: info.
	LogLevel string `envconfig:"LOG_LEVEL" default:"info"`
}

// Load reads config from environment variables with the default prefix "".
func Load() (*Config, error) {
	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
