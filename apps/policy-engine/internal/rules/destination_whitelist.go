package rules

import (
	"context"

	"github.com/wallet-portal/policy-engine/internal/db"
)

// DestinationWhitelist checks that the destination address appears in the
// destination_whitelist table for the given chain.
//
// Dev-mode shortcut: if the whitelist table is empty (no active entries),
// all destinations are allowed. This enables local development without
// pre-populating the table.
//
// TODO(phase-09): remove dev-mode bypass once whitelist seeding is automated.
type DestinationWhitelist struct{}

func (DestinationWhitelist) Name() string { return "destination_whitelist" }

func (DestinationWhitelist) AppliesTo(req EvaluateRequest) bool {
	return req.DestinationAddr != "" && req.Chain != ""
}

func (DestinationWhitelist) Check(ctx context.Context, req EvaluateRequest, q db.Querier) (bool, string, error) {
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
