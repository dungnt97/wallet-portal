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
// TODO(phase-09): make limits configurable via DB or env; hardcoded for MVP.
var dailyLimits = map[db.Role]*big.Float{
	db.RoleOperator:  bigFloat("50000"),
	db.RoleTreasurer: bigFloat("500000"),
	db.RoleAdmin:     bigFloat("1000000"),
	db.RoleViewer:    bigFloat("0"), // viewers cannot initiate withdrawals
}

// DailyLimit enforces a per-role 24-hour rolling withdrawal cap.
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

	limit, ok := dailyLimits[staff.Role]
	if !ok || limit.Sign() == 0 {
		return false, fmt.Sprintf("role %s has no withdrawal limit configured", staff.Role), nil
	}

	// Sum all withdrawals by this staff member in the last 24h.
	numericSum, err := q.SumWithdrawalsToday(ctx, staffUUID)
	if err != nil {
		return false, "failed to query daily withdrawal sum", err
	}

	// Parse the NUMERIC sum returned by Postgres.
	sumStr := numericToString(numericSum)
	sum, _, err2 := big.ParseFloat(sumStr, 10, 128, big.ToNearestEven)
	if err2 != nil {
		return false, "invalid withdrawal sum format from DB", err2
	}

	// Parse the requested amount.
	requested, _, err3 := big.ParseFloat(req.Amount, 10, 128, big.ToNearestEven)
	if err3 != nil {
		return false, "invalid amount in request", err3
	}

	// Project: sum + requested must not exceed limit.
	projected := new(big.Float).Add(sum, requested)
	if projected.Cmp(limit) > 0 {
		limitStr, _ := limit.Float64()
		projStr, _ := projected.Float64()
		return false, fmt.Sprintf("daily limit exceeded: projected=%.2f limit=%.2f role=%s",
			projStr, limitStr, staff.Role), nil
	}

	return true, "", nil
}

// numericToString converts a pgtype.Numeric to its decimal string representation.
// Returns "0" for invalid/null values.
func numericToString(n pgtype.Numeric) string {
	if !n.Valid {
		return "0"
	}
	// pgtype.Numeric exposes Int and Exp: value = Int * 10^Exp
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
