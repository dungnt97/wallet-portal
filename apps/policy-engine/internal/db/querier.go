// Package db — hand-written Querier interface for dependency injection in rules/tests.
// sqlc v1.31 does not emit emit_interface by default without the config flag;
// this file provides a minimal interface covering queries used by the rule engine.
package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
)

// Querier is the narrow read-only interface the rule engine depends on.
// *Queries satisfies this interface. Tests can supply a fake implementation.
type Querier interface {
	GetSigningKeyByAddress(ctx context.Context, arg GetSigningKeyByAddressParams) (StaffSigningKey, error)
	GetStaffMember(ctx context.Context, id pgtype.UUID) (GetStaffMemberRow, error)
	SumWithdrawalsToday(ctx context.Context, createdBy pgtype.UUID) (pgtype.Numeric, error)
	IsDestinationWhitelisted(ctx context.Context, arg IsDestinationWhitelistedParams) (bool, error)
	CountWhitelistEntries(ctx context.Context) (int64, error)
	GetWithdrawal(ctx context.Context, id pgtype.UUID) (GetWithdrawalRow, error)
	// IsOperationalWallet: sweep fast-path — allows destination if it is a registered operational wallet.
	IsOperationalWallet(ctx context.Context, arg IsOperationalWalletParams) (bool, error)
	// GetKillSwitchEnabled: returns the current kill-switch enabled flag (singleton row id=1).
	GetKillSwitchEnabled(ctx context.Context) (bool, error)
}
