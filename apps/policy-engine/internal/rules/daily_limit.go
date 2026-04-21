// daily_limit.go — per-role 24h rolling withdrawal cap with user risk-tier multiplier.
//
// Risk-tier multipliers (applied to the role's base limit):
//
//	low    → 1.0  (full limit)
//	medium → 0.5  (half)
//	high   → 0.2  (20%)
//	frozen → 0.0  → rejected immediately as USER_FROZEN
package rules

import (
	"context"
	"fmt"
	"math/big"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/wallet-portal/policy-engine/internal/db"
)

// dailyLimits maps staff role → maximum USD-equivalent withdrawal per 24h window.
// Values are in the same decimal unit as the withdrawals.amount column.
var dailyLimits = map[db.Role]*big.Float{
	db.RoleOperator:  bigFloat("50000"),
	db.RoleTreasurer: bigFloat("500000"),
	db.RoleAdmin:     bigFloat("1000000"),
	db.RoleViewer:    bigFloat("0"), // viewers cannot initiate withdrawals
}

// riskMultipliers maps user risk_tier → fraction of base limit allowed.
var riskMultipliers = map[string]*big.Float{
	"low":    bigFloat("1.0"),
	"medium": bigFloat("0.5"),
	"high":   bigFloat("0.2"),
	"frozen": bigFloat("0.0"),
}

// DailyLimit enforces a per-role 24-hour rolling withdrawal cap, scaled by
// the end-user's risk tier.
type DailyLimit struct{}

func (DailyLimit) Name() string { return "daily_limit" }

func (DailyLimit) AppliesTo(req EvaluateRequest) bool {
	return req.ActorStaffID != ""
}

func (DailyLimit) Check(ctx context.Context, req EvaluateRequest, q db.Querier) (bool, string, error) {
	// Resolve staff UUID.
	var staffUUID pgtype.UUID
	if err := staffUUID.Scan(req.ActorStaffID); err != nil {
		return false, "invalid actor_staff_id format", nil
	}

	// Load staff member to get their role.
	staff, err := q.GetStaffMember(ctx, staffUUID)
	if err != nil {
		return false, "actor staff member not found", nil
	}

	baseLimit, ok := dailyLimits[staff.Role]
	if !ok || baseLimit.Sign() == 0 {
		return false, fmt.Sprintf("role %s has no withdrawal limit configured", staff.Role), nil
	}

	// Apply user risk-tier multiplier when UserID is provided.
	effectiveLimit := new(big.Float).Set(baseLimit)
	if req.UserID != "" {
		var userUUID pgtype.UUID
		if scanErr := userUUID.Scan(req.UserID); scanErr == nil {
			tier, tierErr := q.GetUserRiskTier(ctx, userUUID)
			if tierErr == nil {
				if tier == "frozen" {
					return false, "USER_FROZEN: user account is frozen — all withdrawals blocked", nil
				}
				if mult, hasMultiplier := riskMultipliers[tier]; hasMultiplier {
					effectiveLimit = new(big.Float).Mul(baseLimit, mult)
				}
			}
			// On DB error for risk tier, log-and-continue with base limit (fail-open for risk).
		}
	}

	// Sum all withdrawals by this staff member in the last 24h.
	numericSum, err := q.SumWithdrawalsToday(ctx, staffUUID)
	if err != nil {
		return false, "failed to query daily withdrawal sum", err
	}

	sumStr := numericToString(numericSum)
	sum, _, err2 := big.ParseFloat(sumStr, 10, 128, big.ToNearestEven)
	if err2 != nil {
		return false, "invalid withdrawal sum format from DB", err2
	}

	requested, _, err3 := big.ParseFloat(req.Amount, 10, 128, big.ToNearestEven)
	if err3 != nil {
		return false, "invalid amount in request", err3
	}

	// Project: sum + requested must not exceed effective limit.
	projected := new(big.Float).Add(sum, requested)
	if projected.Cmp(effectiveLimit) > 0 {
		limitF, _ := effectiveLimit.Float64()
		projF, _ := projected.Float64()
		return false, fmt.Sprintf("daily limit exceeded: projected=%.2f limit=%.2f role=%s",
			projF, limitF, staff.Role), nil
	}

	return true, "", nil
}

// numericToString converts a pgtype.Numeric to its decimal string representation.
// Returns "0" for invalid/null values.
func numericToString(n pgtype.Numeric) string {
	if !n.Valid {
		return "0"
	}
	if n.Int == nil {
		return "0"
	}
	f := new(big.Float).SetInt(n.Int)
	if n.Exp != 0 {
		exp := new(big.Float).SetFloat64(1)
		base := big.NewFloat(10)
		absExp := n.Exp
		if absExp < 0 {
			absExp = -absExp
			for range absExp {
				exp.Mul(exp, base)
			}
			f.Quo(f, exp)
		} else {
			for range absExp {
				exp.Mul(exp, base)
			}
			f.Mul(f, exp)
		}
	}
	return f.Text('f', 18)
}

func bigFloat(s string) *big.Float {
	f, _, _ := big.ParseFloat(s, 10, 128, big.ToNearestEven)
	return f
}
