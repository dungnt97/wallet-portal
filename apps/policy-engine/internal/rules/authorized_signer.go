package rules

import (
	"context"
	"fmt"

	"github.com/wallet-portal/policy-engine/internal/db"
)

// AuthorizedSigner verifies that the signer address belongs to an active
// staff_signing_key for the correct chain and tier, with no revocation.
type AuthorizedSigner struct{}

func (AuthorizedSigner) Name() string { return "authorized_signer" }

func (AuthorizedSigner) AppliesTo(req EvaluateRequest) bool {
	return req.SignerAddress != "" && req.Chain != "" && req.Tier != ""
}

func (AuthorizedSigner) Check(ctx context.Context, req EvaluateRequest, q db.Querier) (bool, string, error) {
	key, err := q.GetSigningKeyByAddress(ctx, db.GetSigningKeyByAddressParams{
		Address: req.SignerAddress,
		Column2: db.Chain(req.Chain),
		Column3: db.Tier(req.Tier),
	})
	if err != nil {
		// pgx returns pgx.ErrNoRows when no row found — treat as unauthorized.
		return false, fmt.Sprintf("no active signing key for address %s...%s on chain=%s tier=%s",
			safePrefix(req.SignerAddress, 6), safeSuffix(req.SignerAddress, 4),
			req.Chain, req.Tier), nil
	}

	// Key found and revoked_at IS NULL is enforced in SQL; double-check tier match.
	if string(key.Tier) != req.Tier {
		return false, fmt.Sprintf("signing key tier mismatch: key=%s requested=%s", key.Tier, req.Tier), nil
	}

	return true, "", nil
}

// safePrefix returns the first n chars of s, or the whole string if shorter.
func safePrefix(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// safeSuffix returns the last n chars of s, or the whole string if shorter.
func safeSuffix(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[len(s)-n:]
}
