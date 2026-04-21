package rules_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/wallet-portal/policy-engine/internal/db"
	"github.com/wallet-portal/policy-engine/internal/rules"
)

// fakeQuerier is an in-memory implementation of db.Querier for unit tests.
// Zero values mean "not found" / return error depending on the field.
type fakeQuerier struct {
	signingKey    *db.StaffSigningKey
	signingKeyErr error

	staffMember    *db.GetStaffMemberRow
	staffMemberErr error

	withdrawalSum    pgtype.Numeric
	withdrawalSumErr error

	whitelisted    bool
	whitelistedErr error

	whitelistCount    int64
	whitelistCountErr error

	withdrawal    *db.GetWithdrawalRow
	withdrawalErr error

	isOperationalWallet    bool
	isOperationalWalletErr error
}

func (f *fakeQuerier) GetSigningKeyByAddress(_ context.Context, _ db.GetSigningKeyByAddressParams) (db.StaffSigningKey, error) {
	if f.signingKeyErr != nil {
		return db.StaffSigningKey{}, f.signingKeyErr
	}
	if f.signingKey == nil {
		return db.StaffSigningKey{}, errors.New("no rows")
	}
	return *f.signingKey, nil
}

func (f *fakeQuerier) GetStaffMember(_ context.Context, _ pgtype.UUID) (db.GetStaffMemberRow, error) {
	if f.staffMemberErr != nil {
		return db.GetStaffMemberRow{}, f.staffMemberErr
	}
	if f.staffMember == nil {
		return db.GetStaffMemberRow{}, errors.New("no rows")
	}
	return *f.staffMember, nil
}

func (f *fakeQuerier) SumWithdrawalsToday(_ context.Context, _ pgtype.UUID) (pgtype.Numeric, error) {
	return f.withdrawalSum, f.withdrawalSumErr
}

func (f *fakeQuerier) IsDestinationWhitelisted(_ context.Context, _ db.IsDestinationWhitelistedParams) (bool, error) {
	return f.whitelisted, f.whitelistedErr
}

func (f *fakeQuerier) CountWhitelistEntries(_ context.Context) (int64, error) {
	return f.whitelistCount, f.whitelistCountErr
}

func (f *fakeQuerier) GetWithdrawal(_ context.Context, _ pgtype.UUID) (db.GetWithdrawalRow, error) {
	if f.withdrawalErr != nil {
		return db.GetWithdrawalRow{}, f.withdrawalErr
	}
	if f.withdrawal == nil {
		return db.GetWithdrawalRow{}, errors.New("no rows")
	}
	return *f.withdrawal, nil
}

func (f *fakeQuerier) IsOperationalWallet(_ context.Context, _ db.IsOperationalWalletParams) (bool, error) {
	return f.isOperationalWallet, f.isOperationalWalletErr
}

// ── AuthorizedSigner tests ────────────────────────────────────────────────────

func TestAuthorizedSigner(t *testing.T) {
	rule := rules.AuthorizedSigner{}
	ctx := context.Background()

	tests := []struct {
		name      string
		req       rules.EvaluateRequest
		querier   *fakeQuerier
		wantPass  bool
		wantApply bool
	}{
		{
			name: "active key found",
			req:  rules.EvaluateRequest{SignerAddress: "0xabc", Chain: "bnb", Tier: "hot"},
			querier: &fakeQuerier{signingKey: &db.StaffSigningKey{
				Address: "0xabc", Chain: db.ChainBnb, Tier: db.TierHot,
			}},
			wantPass: true, wantApply: true,
		},
		{
			name:      "key not found",
			req:       rules.EvaluateRequest{SignerAddress: "0xdead", Chain: "bnb", Tier: "hot"},
			querier:   &fakeQuerier{signingKeyErr: errors.New("no rows")},
			wantPass:  false,
			wantApply: true,
		},
		{
			name:      "missing signer address — rule skipped",
			req:       rules.EvaluateRequest{Chain: "bnb", Tier: "hot"},
			querier:   &fakeQuerier{},
			wantPass:  true, // N/A — AppliesTo false
			wantApply: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if rule.AppliesTo(tc.req) != tc.wantApply {
				t.Fatalf("AppliesTo = %v, want %v", rule.AppliesTo(tc.req), tc.wantApply)
			}
			if !tc.wantApply {
				return
			}
			pass, reason, err := rule.Check(ctx, tc.req, tc.querier)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if pass != tc.wantPass {
				t.Errorf("pass = %v (reason: %q), want %v", pass, reason, tc.wantPass)
			}
		})
	}
}

// ── DailyLimit tests ──────────────────────────────────────────────────────────

func numericFromString(s string) pgtype.Numeric {
	var n pgtype.Numeric
	_ = n.Scan(s)
	return n
}

func uuidFromString(s string) pgtype.UUID {
	var u pgtype.UUID
	_ = u.Scan(s)
	return u
}

func TestDailyLimit(t *testing.T) {
	rule := rules.DailyLimit{}
	ctx := context.Background()
	staffID := "a0000000-0000-0000-0000-000000000001"

	tests := []struct {
		name     string
		req      rules.EvaluateRequest
		querier  *fakeQuerier
		wantPass bool
	}{
		{
			name: "operator within limit",
			req:  rules.EvaluateRequest{ActorStaffID: staffID, Amount: "10000", Chain: "bnb"},
			querier: &fakeQuerier{
				staffMember:   &db.GetStaffMemberRow{ID: uuidFromString(staffID), Role: db.RoleOperator},
				withdrawalSum: numericFromString("0"),
			},
			wantPass: true,
		},
		{
			name: "operator exceeds limit",
			req:  rules.EvaluateRequest{ActorStaffID: staffID, Amount: "10000", Chain: "bnb"},
			querier: &fakeQuerier{
				staffMember:   &db.GetStaffMemberRow{ID: uuidFromString(staffID), Role: db.RoleOperator},
				withdrawalSum: numericFromString("45000"), // 45k+10k = 55k > 50k
			},
			wantPass: false,
		},
		{
			name: "treasurer within limit",
			req:  rules.EvaluateRequest{ActorStaffID: staffID, Amount: "100000", Chain: "bnb"},
			querier: &fakeQuerier{
				staffMember:   &db.GetStaffMemberRow{ID: uuidFromString(staffID), Role: db.RoleTreasurer},
				withdrawalSum: numericFromString("0"),
			},
			wantPass: true,
		},
		{
			name: "viewer blocked",
			req:  rules.EvaluateRequest{ActorStaffID: staffID, Amount: "1", Chain: "bnb"},
			querier: &fakeQuerier{
				staffMember:   &db.GetStaffMemberRow{ID: uuidFromString(staffID), Role: db.RoleViewer},
				withdrawalSum: numericFromString("0"),
			},
			wantPass: false,
		},
		{
			name:     "staff not found",
			req:      rules.EvaluateRequest{ActorStaffID: staffID, Amount: "100", Chain: "bnb"},
			querier:  &fakeQuerier{staffMemberErr: errors.New("no rows")},
			wantPass: false,
		},
		{
			name:     "invalid staff uuid",
			req:      rules.EvaluateRequest{ActorStaffID: "not-a-uuid", Amount: "100", Chain: "bnb"},
			querier:  &fakeQuerier{},
			wantPass: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			pass, reason, err := rule.Check(ctx, tc.req, tc.querier)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if pass != tc.wantPass {
				t.Errorf("pass = %v (reason: %q), want %v", pass, reason, tc.wantPass)
			}
		})
	}
}

// ── DestinationWhitelist tests ────────────────────────────────────────────────

func TestDestinationWhitelist(t *testing.T) {
	rule := rules.DestinationWhitelist{}
	ctx := context.Background()

	tests := []struct {
		name     string
		req      rules.EvaluateRequest
		querier  *fakeQuerier
		wantPass bool
	}{
		{
			name:     "empty whitelist — dev mode allows all",
			req:      rules.EvaluateRequest{DestinationAddr: "0xany", Chain: "bnb"},
			querier:  &fakeQuerier{whitelistCount: 0, whitelisted: false},
			wantPass: true,
		},
		{
			name:     "address in whitelist",
			req:      rules.EvaluateRequest{DestinationAddr: "0xgood", Chain: "bnb"},
			querier:  &fakeQuerier{whitelistCount: 5, whitelisted: true},
			wantPass: true,
		},
		{
			name:     "address not in whitelist",
			req:      rules.EvaluateRequest{DestinationAddr: "0xbad", Chain: "bnb"},
			querier:  &fakeQuerier{whitelistCount: 5, whitelisted: false},
			wantPass: false,
		},
		{
			name:     "count query error — propagates error",
			req:      rules.EvaluateRequest{DestinationAddr: "0xany", Chain: "bnb"},
			querier:  &fakeQuerier{whitelistCountErr: errors.New("db down")},
			wantPass: false,
		},
		{
			name:     "sweep to known operational wallet — allowed without whitelist",
			req:      rules.EvaluateRequest{DestinationAddr: "0xhot_safe", Chain: "bnb", OperationType: "sweep"},
			querier:  &fakeQuerier{isOperationalWallet: true},
			wantPass: true,
		},
		{
			name:     "sweep to unknown address — denied",
			req:      rules.EvaluateRequest{DestinationAddr: "0xunknown", Chain: "bnb", OperationType: "sweep"},
			querier:  &fakeQuerier{isOperationalWallet: false},
			wantPass: false,
		},
		{
			name:     "sweep — DB error checking operational wallet — fail closed",
			req:      rules.EvaluateRequest{DestinationAddr: "0xany", Chain: "bnb", OperationType: "sweep"},
			querier:  &fakeQuerier{isOperationalWalletErr: errors.New("db down")},
			wantPass: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			pass, reason, _ := rule.Check(ctx, tc.req, tc.querier)
			if pass != tc.wantPass {
				t.Errorf("pass = %v (reason: %q), want %v", pass, reason, tc.wantPass)
			}
		})
	}
}

// ── HwAttested tests ──────────────────────────────────────────────────────────

func TestHwAttested(t *testing.T) {
	rule := rules.HwAttested{}
	ctx := context.Background()

	tests := []struct {
		name      string
		req       rules.EvaluateRequest
		querier   *fakeQuerier
		wantPass  bool
		wantApply bool
	}{
		{
			name: "cold tier hw_attested=true — passes",
			req:  rules.EvaluateRequest{Tier: "cold", SignerAddress: "0xhw", Chain: "bnb"},
			querier: &fakeQuerier{signingKey: &db.StaffSigningKey{
				HwAttested: true, Tier: db.TierCold,
			}},
			wantPass: true, wantApply: true,
		},
		{
			name: "cold tier hw_attested=false — denied",
			req:  rules.EvaluateRequest{Tier: "cold", SignerAddress: "0xsoft", Chain: "bnb"},
			querier: &fakeQuerier{signingKey: &db.StaffSigningKey{
				HwAttested: false, Tier: db.TierCold,
			}},
			wantPass: false, wantApply: true,
		},
		{
			name:      "hot tier — rule does not apply",
			req:       rules.EvaluateRequest{Tier: "hot", SignerAddress: "0xsw", Chain: "bnb"},
			querier:   &fakeQuerier{},
			wantPass:  true,
			wantApply: false,
		},
		{
			name:      "cold tier no key — denied",
			req:       rules.EvaluateRequest{Tier: "cold", SignerAddress: "0xmissing", Chain: "bnb"},
			querier:   &fakeQuerier{signingKeyErr: errors.New("no rows")},
			wantPass:  false,
			wantApply: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if rule.AppliesTo(tc.req) != tc.wantApply {
				t.Fatalf("AppliesTo = %v, want %v", rule.AppliesTo(tc.req), tc.wantApply)
			}
			if !tc.wantApply {
				return
			}
			pass, reason, err := rule.Check(ctx, tc.req, tc.querier)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if pass != tc.wantPass {
				t.Errorf("pass = %v (reason: %q), want %v", pass, reason, tc.wantPass)
			}
		})
	}
}

// ── TimeLock tests ────────────────────────────────────────────────────────────

func TestTimeLock(t *testing.T) {
	rule := rules.TimeLock{}
	ctx := context.Background()
	wID := "b0000000-0000-0000-0000-000000000002"

	expiredTime := pgtype.Timestamptz{Time: time.Now().Add(-1 * time.Hour), Valid: true}
	futureTime := pgtype.Timestamptz{Time: time.Now().Add(25 * time.Hour), Valid: true}

	tests := []struct {
		name     string
		req      rules.EvaluateRequest
		querier  *fakeQuerier
		wantPass bool
	}{
		{
			name:     "hot tier small amount — no lock needed",
			req:      rules.EvaluateRequest{Tier: "hot", Amount: "1000", Chain: "bnb"},
			querier:  &fakeQuerier{},
			wantPass: true,
		},
		{
			name: "hot tier large — lock expired — passes",
			req:  rules.EvaluateRequest{Tier: "hot", Amount: "60000", Chain: "bnb", WithdrawalID: wID},
			querier: &fakeQuerier{withdrawal: &db.GetWithdrawalRow{
				TimeLockExpiresAt: expiredTime,
			}},
			wantPass: true,
		},
		{
			name: "hot tier large — lock still active — denied",
			req:  rules.EvaluateRequest{Tier: "hot", Amount: "60000", Chain: "bnb", WithdrawalID: wID},
			querier: &fakeQuerier{withdrawal: &db.GetWithdrawalRow{
				TimeLockExpiresAt: futureTime,
			}},
			wantPass: false,
		},
		{
			name:     "hot tier large — no withdrawal record yet — denied",
			req:      rules.EvaluateRequest{Tier: "hot", Amount: "60000", Chain: "bnb", WithdrawalID: wID},
			querier:  &fakeQuerier{withdrawalErr: errors.New("no rows")},
			wantPass: false,
		},
		{
			name:     "cold tier — no withdrawal id — denied (lock required)",
			req:      rules.EvaluateRequest{Tier: "cold", Amount: "100", Chain: "bnb"},
			querier:  &fakeQuerier{},
			wantPass: false,
		},
		{
			name: "cold tier — lock expired — passes",
			req:  rules.EvaluateRequest{Tier: "cold", Amount: "100", Chain: "bnb", WithdrawalID: wID},
			querier: &fakeQuerier{withdrawal: &db.GetWithdrawalRow{
				TimeLockExpiresAt: expiredTime,
			}},
			wantPass: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			pass, reason, err := rule.Check(ctx, tc.req, tc.querier)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if pass != tc.wantPass {
				t.Errorf("pass = %v (reason: %q), want %v", pass, reason, tc.wantPass)
			}
		})
	}
}
