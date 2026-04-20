package rules

import (
	"context"

	"github.com/wallet-portal/policy-engine/internal/db"
)

// HwAttested enforces that cold-tier signers must use a hardware-attested key
// (hw_attested = true in staff_signing_keys). Hot-tier operations are exempt.
//
// This rule depends on AuthorizedSigner having located a valid key; if no key
// is found for the address, it fails with a clear reason rather than panicking.
type HwAttested struct{}

func (HwAttested) Name() string { return "hw_attested_required_for_cold" }

// AppliesTo only triggers for cold-tier requests with a signer address present.
func (HwAttested) AppliesTo(req EvaluateRequest) bool {
	return req.Tier == "cold" && req.SignerAddress != "" && req.Chain != ""
}

func (HwAttested) Check(ctx context.Context, req EvaluateRequest, q db.Querier) (bool, string, error) {
	key, err := q.GetSigningKeyByAddress(ctx, db.GetSigningKeyByAddressParams{
		Address: req.SignerAddress,
		Column2: db.Chain(req.Chain),
		Column3: db.Tier(req.Tier),
	})
	if err != nil {
		// No active key found — fail safe (authorized_signer rule will also catch this).
		return false, "signing key not found; hw_attested check cannot proceed", nil
	}

	if !key.HwAttested {
		return false, "cold-tier operations require a hardware-attested signing key (hw_attested=false)", nil
	}

	return true, "", nil
}
