// user_risk_query.go — hand-written query for user risk_tier.
// Not in sqlc-generated queries.sql.go because schema column was added post-generation.
// Added to Querier interface in querier.go.
package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
)

const getUserRiskTier = `SELECT COALESCE(risk_tier, 'low') FROM users WHERE id = $1`

// GetUserRiskTier returns the risk_tier for a user, defaulting to 'low' if NULL.
func (q *Queries) GetUserRiskTier(ctx context.Context, userID pgtype.UUID) (string, error) {
	row := q.db.QueryRow(ctx, getUserRiskTier, userID)
	var tier string
	if err := row.Scan(&tier); err != nil {
		return "low", err
	}
	return tier, nil
}
