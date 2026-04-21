// Package service contains the policy evaluator that orchestrates all rules.
package service

import (
	"context"

	"github.com/wallet-portal/policy-engine/internal/db"
	"github.com/wallet-portal/policy-engine/internal/rules"
)

// EvaluateResponse is the structured result returned from the evaluator and
// serialised as the HTTP response body.
type EvaluateResponse struct {
	Allow   bool     `json:"allow"`
	Reasons []string `json:"reasons"`
}

// Evaluator runs all registered rules against a request and aggregates results.
// Rules are NOT short-circuited — all applicable rules run to produce a full
// audit trail of every failing constraint.
type Evaluator struct {
	rules   []rules.Rule
	querier db.Querier
}

// New constructs an Evaluator with the provided rules and DB querier.
func New(q db.Querier, ruleSet []rules.Rule) *Evaluator {
	return &Evaluator{querier: q, rules: ruleSet}
}

// DefaultRules returns the canonical production rule set.
// KillSwitchCheck runs first so a globally-paused system fails fast before
// any DB-intensive checks (daily-limit, whitelist) are executed.
// devMode=true enables synthetic attestation blobs for local development (POLICY_DEV_MODE env).
func DefaultRules(devMode bool) []rules.Rule {
	return []rules.Rule{
		&rules.KillSwitchCheck{},
		rules.AuthorizedSigner{},
		rules.DailyLimit{},
		rules.DestinationWhitelist{},
		rules.TimeLock{},
		rules.HwAttested{DevMode: devMode},
	}
}

// Evaluate runs every applicable rule and returns the aggregated result.
// The response Allow field is true only when ALL applicable rules pass.
func (e *Evaluator) Evaluate(ctx context.Context, req rules.EvaluateRequest) EvaluateResponse {
	resp := EvaluateResponse{Allow: true, Reasons: []string{}}

	for _, rule := range e.rules {
		if !rule.AppliesTo(req) {
			continue
		}

		pass, reason, err := rule.Check(ctx, req, e.querier)
		if err != nil {
			// System/DB errors are logged by the caller via the returned reason.
			resp.Allow = false
			resp.Reasons = append(resp.Reasons, rule.Name()+": internal error: "+err.Error())
			continue
		}
		if !pass {
			resp.Allow = false
			resp.Reasons = append(resp.Reasons, rule.Name()+": "+reason)
		}
	}

	return resp
}
