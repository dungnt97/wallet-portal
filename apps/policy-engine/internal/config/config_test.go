package config

import (
	"os"
	"testing"
)

func TestLoad_WithAllRequiredEnvVars(t *testing.T) {
	// Set required environment variables
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost/db")
	t.Setenv("SVC_BEARER_TOKEN", "test_token_123")
	// CI sets POLICY_DEV_MODE=true at workflow level; unset for default-value assertion
	_ = os.Unsetenv("POLICY_DEV_MODE")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.DatabaseURL != "postgres://user:pass@localhost/db" {
		t.Errorf("DatabaseURL = %q, want postgres://user:pass@localhost/db", cfg.DatabaseURL)
	}
	if cfg.SvcBearerToken != "test_token_123" {
		t.Errorf("SvcBearerToken = %q, want test_token_123", cfg.SvcBearerToken)
	}
	if cfg.Port != "3003" {
		t.Errorf("Port = %q, want 3003 (default)", cfg.Port)
	}
	if cfg.LogLevel != "info" {
		t.Errorf("LogLevel = %q, want info (default)", cfg.LogLevel)
	}
	if cfg.PolicyDevMode != false {
		t.Errorf("PolicyDevMode = %v, want false (default)", cfg.PolicyDevMode)
	}
}

func TestLoad_MissingDatabaseURL(t *testing.T) {
	// Unset DATABASE_URL and ensure error is returned
	t.Setenv("SVC_BEARER_TOKEN", "test_token")
	_ = os.Unsetenv("DATABASE_URL")

	cfg, err := Load()
	if err == nil {
		t.Errorf("Load should fail when DATABASE_URL is missing, got cfg=%v", cfg)
	}
}

func TestLoad_MissingSvcBearerToken(t *testing.T) {
	// Unset SVC_BEARER_TOKEN and ensure error is returned
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	_ = os.Unsetenv("SVC_BEARER_TOKEN")

	cfg, err := Load()
	if err == nil {
		t.Errorf("Load should fail when SVC_BEARER_TOKEN is missing, got cfg=%v", cfg)
	}
}

func TestLoad_WithCustomPort(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("SVC_BEARER_TOKEN", "token")
	t.Setenv("PORT", "8080")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.Port != "8080" {
		t.Errorf("Port = %q, want 8080", cfg.Port)
	}
}

func TestLoad_WithCustomLogLevel(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("SVC_BEARER_TOKEN", "token")
	t.Setenv("LOG_LEVEL", "debug")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.LogLevel != "debug" {
		t.Errorf("LogLevel = %q, want debug", cfg.LogLevel)
	}
}

func TestLoad_WithDevMode(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("SVC_BEARER_TOKEN", "token")
	t.Setenv("POLICY_DEV_MODE", "true")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if !cfg.PolicyDevMode {
		t.Errorf("PolicyDevMode = %v, want true", cfg.PolicyDevMode)
	}
}

func TestLoad_AllCustomValues(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://custom:cred@host:5432/db")
	t.Setenv("SVC_BEARER_TOKEN", "custom_token_abc123")
	t.Setenv("PORT", "9999")
	t.Setenv("LOG_LEVEL", "error")
	t.Setenv("POLICY_DEV_MODE", "true")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.DatabaseURL != "postgres://custom:cred@host:5432/db" {
		t.Errorf("DatabaseURL = %q", cfg.DatabaseURL)
	}
	if cfg.SvcBearerToken != "custom_token_abc123" {
		t.Errorf("SvcBearerToken = %q", cfg.SvcBearerToken)
	}
	if cfg.Port != "9999" {
		t.Errorf("Port = %q", cfg.Port)
	}
	if cfg.LogLevel != "error" {
		t.Errorf("LogLevel = %q", cfg.LogLevel)
	}
	if !cfg.PolicyDevMode {
		t.Errorf("PolicyDevMode = %v", cfg.PolicyDevMode)
	}
}
