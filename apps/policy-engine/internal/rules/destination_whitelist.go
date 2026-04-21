package rules

import (
	"context"

	"github.com/wallet-portal/policy-engine/internal/db"
)

// DestinationWhitelist checks that the destination address is allowed for the operation.
//
// Fast-path for sweep operations: destination is always hot_safe (operational wallet).
// If the destination is a registered operational or cold_reserve wallet, it is allowed
// without requiring an entry in the destination_whitelist table.
//
// Dev-mode shortcut: if the destination_whitelist table is empty (no active entries),
// all destinations are allowed — enables local development without pre-populating.
type DestinationWhitelist struct{}

func (DestinationWhitelist) Name() string { return "destination_whitelist" }

func (DestinationWhitelist) AppliesTo(req EvaluateRequest) bool {
	return req.DestinationAddr != "" && req.Chain != ""
}

func (DestinationWhitelist) Check(ctx context.Context, req EvaluateRequest, q db.Querier) (bool, string, error) {
	// Sweep fast-path: destination is a registered operational/cold_reserve wallet → allow.
	// This covers the hot_safe sweep target without requiring whitelist seeding.
	if req.OperationType == "sweep" {
		isOp, err := q.IsOperationalWallet(ctx, db.IsOperationalWalletParams{
			Column1: db.Chain(req.Chain),
			Address: req.DestinationAddr,
		})
		if err != nil {
			// Fail-closed: DB error → deny
			return false, "failed to check operational wallet: " + err.Error(), nil
		}
		if isOp {
			return true, "", nil
		}
		// Destination is not a known operational wallet — deny sweep
		redacted := safePrefix(req.DestinationAddr, 6) + "..." + safeSuffix(req.DestinationAddr, 4)
		return false, "sweep destination is not a registered operational wallet: " + redacted, nil
	}

	// Dev-mode: allow all when the whitelist is empty.
	count, err := q.CountWhitelistEntries(ctx)
	if err != nil {
		return false, "failed to count whitelist entries", err
	}
	if count == 0 {
		// Whitelist is empty — allow all destinations (dev/seed mode).
		return true, "", nil
	}

	whitelisted, err := q.IsDestinationWhitelisted(ctx, db.IsDestinationWhitelistedParams{
		Column1: db.Chain(req.Chain),
		Address: req.DestinationAddr,
	})
	if err != nil {
		return false, "failed to query destination whitelist", err
	}

	if !whitelisted {
		// Redact middle of address for logs — only prefix+suffix exposed.
		redacted := safePrefix(req.DestinationAddr, 6) + "..." + safeSuffix(req.DestinationAddr, 4)
		return false, "destination address not whitelisted: " + redacted, nil
	}

	return true, "", nil
}
