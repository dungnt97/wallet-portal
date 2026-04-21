// Package rules defines the Rule interface and shared request/response types
// for the policy engine evaluator.
package rules

import (
	"context"

	"github.com/wallet-portal/policy-engine/internal/db"
)

// EvaluateRequest carries all fields needed for a pre-sign policy check.
// Callers populate from the HTTP request body; the engine passes it to each rule.
type EvaluateRequest struct {
	// OperationType distinguishes withdrawal, sweep, etc. Default: "withdrawal".
	OperationType string `json:"operation_type"`

	// ActorStaffID is the UUID of the staff member requesting the operation.
	ActorStaffID string `json:"actor_staff_id"`

	// DestinationAddr is the target wallet address (hex for EVM, base58 for Solana).
	DestinationAddr string `json:"destination_addr"`

	// Amount is the withdrawal amount as a decimal string (e.g. "1000.00").
	Amount string `json:"amount"`

	// Chain is the source chain: "bnb" | "sol".
	Chain string `json:"chain"`

	// Tier is the source custody tier: "hot" | "cold".
	Tier string `json:"tier"`

	// SignerAddress is the address of the signing key being used (for authorized-signer rule).
	SignerAddress string `json:"signer_address"`

	// WithdrawalID is optional; populated when a withdrawal record already exists.
	WithdrawalID string `json:"withdrawal_id"`

	// UserID is the end-user UUID whose funds are being moved.
	// Used by daily_limit to fetch user risk_tier for the limit multiplier.
	UserID string `json:"user_id"`
}

// RuleResult is the outcome of a single rule evaluation.
type RuleResult struct {
	RuleName string
	Pass     bool
	Reason   string
}

// Rule is implemented by every policy evaluator.
// Rules are stateless; all DB access goes through the injected Querier.
type Rule interface {
	// Name returns a stable, human-readable identifier used in audit logs and
	// deny reasons (e.g. "hw_attested_required_for_cold").
	Name() string

	// AppliesTo returns false when this rule should be skipped for the given
	// request (e.g. hw_attested rule only applies when Tier == "cold").
	AppliesTo(req EvaluateRequest) bool

	// Check executes the rule logic. Returns pass=true on success.
	// On a DB or system error the rule should return pass=false and a descriptive
	// reason — callers treat system errors as implicit denials.
	Check(ctx context.Context, req EvaluateRequest, q db.Querier) (pass bool, reason string, err error)
}
