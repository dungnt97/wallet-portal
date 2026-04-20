package rules

import (
	"context"
	"fmt"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/wallet-portal/policy-engine/internal/db"
)

// timeLockThresholds defines the minimum lock duration per tier+amount band.
// hot tier < 50k: no lock required
// hot tier >= 50k: 24h lock required
// cold tier: 48h lock required regardless of amount
var timeLockThresholds = struct {
	hotLargeThreshold *big.Float
	hotLargeDuration  time.Duration
	coldDuration      time.Duration
}{
	hotLargeThreshold: bigFloat("50000"),
	hotLargeDuration:  24 * time.Hour,
	coldDuration:      48 * time.Hour,
}

// TimeLock enforces time-lock expiry constraints per tier and amount.
// If a time_lock_expires_at is required but not set (or not yet expired), the rule fails.
// The rule looks up the withdrawal record when a WithdrawalID is present.
type TimeLock struct{}

func (TimeLock) Name() string { return "time_lock" }

// AppliesTo is true for all withdrawal operations — time-lock rules always apply.
func (TimeLock) AppliesTo(req EvaluateRequest) bool {
	return req.OperationType == "" || req.OperationType == "withdrawal"
}

func (TimeLock) Check(ctx context.Context, req EvaluateRequest, q db.Querier) (bool, string, error) {
	requiredDuration := timeLockRequired(req.Tier, req.Amount)
	if requiredDuration == 0 {
		// No time-lock needed for this tier+amount combination.
		return true, "", nil
	}

	// If a withdrawal record exists, check its stored time_lock_expires_at.
	if req.WithdrawalID != "" {
		var wID pgtype.UUID
		if err := wID.Scan(req.WithdrawalID); err != nil {
			return false, "invalid withdrawal_id format", nil
		}

		row, err := q.GetWithdrawal(ctx, wID)
		if err != nil {
			// No withdrawal record — cannot verify lock; deny by default.
			return false, "withdrawal record not found, cannot verify time-lock", nil
		}

		if !row.TimeLockExpiresAt.Valid {
			return false, fmt.Sprintf(
				"time_lock_expires_at not set; tier=%s requires %s lock",
				req.Tier, requiredDuration), nil
		}

		if time.Now().UTC().Before(row.TimeLockExpiresAt.Time) {
			remaining := time.Until(row.TimeLockExpiresAt.Time).Round(time.Minute)
			return false, fmt.Sprintf(
				"time-lock active: %s remaining (expires %s)",
				remaining, row.TimeLockExpiresAt.Time.Format(time.RFC3339)), nil
		}

		// Lock has expired — allow.
		return true, "", nil
	}

	// No withdrawal record: this is a prospective check (pre-creation).
	// Inform the caller that a time-lock must be applied before execution.
	return false, fmt.Sprintf(
		"time-lock required for tier=%s amount=%s: set time_lock_expires_at = now()+%s",
		req.Tier, req.Amount, requiredDuration), nil
}

// timeLockRequired returns the lock duration needed for a given tier+amount.
// Returns 0 when no lock is required.
func timeLockRequired(tier string, amountStr string) time.Duration {
	switch tier {
	case "cold":
		return timeLockThresholds.coldDuration
	case "hot":
		amount, _, err := big.ParseFloat(amountStr, 10, 128, big.ToNearestEven)
		if err != nil || amount == nil {
			// Cannot parse amount — default to requiring a lock (fail safe).
			return timeLockThresholds.hotLargeDuration
		}
		if amount.Cmp(timeLockThresholds.hotLargeThreshold) >= 0 {
			return timeLockThresholds.hotLargeDuration
		}
		return 0
	default:
		return 0
	}
}
