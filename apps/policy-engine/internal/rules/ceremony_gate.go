package rules

import (
	"context"
	"fmt"

	"github.com/wallet-portal/policy-engine/internal/db"
)

// CeremonyGate blocks withdrawal and sweep operations while a signer ceremony
// is actively executing on the same chain. This prevents a withdrawal from
// racing through an owner-management transaction on-chain, which could
// cause the Safe/Squads execution to fail or use a stale signer set.
//
// Applies to: operation_type IN ("withdrawal", "sweep", "hot_to_cold")
// Denies with reason: "SIGNER_CEREMONY_IN_PROGRESS"
type CeremonyGate struct{}

func (CeremonyGate) Name() string { return "ceremony_gate" }

// AppliesTo returns true for operations that interact with the multisig wallet
// on-chain — withdrawals, sweeps, and hot_to_cold rebalances.
func (CeremonyGate) AppliesTo(req EvaluateRequest) bool {
	switch req.OperationType {
	case "withdrawal", "sweep", "hot_to_cold":
		return req.Chain != ""
	}
	return false
}

func (CeremonyGate) Check(ctx context.Context, req EvaluateRequest, q db.Querier) (bool, string, error) {
	// Map the request chain to the chain_states JSON key used in signer_ceremonies.
	// BNB chain key = "bnb"; Solana chain key = "solana".
	chainKey := chainStateKey(req.Chain)

	active, err := q.HasActiveCeremony(ctx, chainKey)
	if err != nil {
		// Fail closed: DB errors block the operation rather than silently allowing it.
		return false, fmt.Sprintf("ceremony_gate: db error checking active ceremonies: %v", err), nil
	}

	if active {
		return false, fmt.Sprintf(
			"SIGNER_CEREMONY_IN_PROGRESS: a signer ceremony is actively executing on chain=%s; operation blocked until ceremony completes",
			req.Chain,
		), nil
	}

	return true, "", nil
}

// chainStateKey converts the request chain identifier to the JSON key used in
// the signer_ceremonies.chain_states jsonb column.
func chainStateKey(chain string) string {
	if chain == "sol" {
		return "solana"
	}
	return chain // "bnb" maps to "bnb"
}
