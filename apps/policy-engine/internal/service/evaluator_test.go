package service

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/wallet-portal/policy-engine/internal/db"
	"github.com/wallet-portal/policy-engine/internal/rules"
)

// fakeQuerier is a minimal test double for db.Querier.
type fakeQuerier struct{}

func (f *fakeQuerier) GetSigningKeyByAddress(ctx context.Context, params db.GetSigningKeyByAddressParams) (db.StaffSigningKey, error) {
	return db.StaffSigningKey{}, nil
}

func (f *fakeQuerier) GetStaffMember(ctx context.Context, id pgtype.UUID) (db.GetStaffMemberRow, error) {
	return db.GetStaffMemberRow{}, nil
}

func (f *fakeQuerier) SumWithdrawalsToday(ctx context.Context, id pgtype.UUID) (pgtype.Numeric, error) {
	return pgtype.Numeric{}, nil
}

func (f *fakeQuerier) IsDestinationWhitelisted(ctx context.Context, params db.IsDestinationWhitelistedParams) (bool, error) {
	return false, nil
}

func (f *fakeQuerier) CountWhitelistEntries(ctx context.Context) (int64, error) {
	return 0, nil
}

func (f *fakeQuerier) GetWithdrawal(ctx context.Context, id pgtype.UUID) (db.GetWithdrawalRow, error) {
	return db.GetWithdrawalRow{}, nil
}

func (f *fakeQuerier) IsOperationalWallet(ctx context.Context, params db.IsOperationalWalletParams) (bool, error) {
	return false, nil
}

func (f *fakeQuerier) GetKillSwitchEnabled(ctx context.Context) (bool, error) {
	return false, nil
}

func (f *fakeQuerier) IsColdReserveWallet(ctx context.Context, params db.IsColdReserveWalletParams) (bool, error) {
	return false, nil
}

func (f *fakeQuerier) GetApprovalsForWithdrawal(ctx context.Context, id pgtype.UUID) ([]db.ApprovalWithSigner, error) {
	return []db.ApprovalWithSigner{}, nil
}

func (f *fakeQuerier) HasActiveCeremony(ctx context.Context, chain string) (bool, error) {
	return false, nil
}

func (f *fakeQuerier) GetUserRiskTier(ctx context.Context, id pgtype.UUID) (string, error) {
	return "low", nil
}

func TestEvaluate_AllRulesPass(t *testing.T) {
	// When all applicable rules pass, Allow should be true and Reasons empty.
	q := &fakeQuerier{}
	ruleSet := []rules.Rule{
		&rules.KillSwitchCheck{},
		rules.CeremonyGate{},
	}
	eval := New(q, ruleSet)

	req := rules.EvaluateRequest{
		Chain:  "bnb",
		Amount: "1000",
	}

	resp := eval.Evaluate(context.Background(), req)
	if !resp.Allow {
		t.Errorf("Allow = %v, want true", resp.Allow)
	}
	if len(resp.Reasons) > 0 {
		t.Errorf("Reasons = %v, want empty", resp.Reasons)
	}
}

func TestEvaluate_NoApplicableRules(t *testing.T) {
	// Request that doesn't match any rules should pass.
	q := &fakeQuerier{}
	ruleSet := []rules.Rule{
		&rules.KillSwitchCheck{},
	}
	eval := New(q, ruleSet)

	req := rules.EvaluateRequest{
		// KillSwitchCheck only applies to withdrawal/sweep, so deposit should not apply
		OperationType: "deposit",
		Chain:         "bnb",
		Amount:        "1000",
	}

	resp := eval.Evaluate(context.Background(), req)
	if !resp.Allow {
		t.Errorf("Allow = %v, want true (no applicable rules)", resp.Allow)
	}
}

func TestEvaluate_ResponseStructure(t *testing.T) {
	// Verify response structure is properly formed.
	q := &fakeQuerier{}
	ruleSet := DefaultRules(false)
	eval := New(q, ruleSet)

	req := rules.EvaluateRequest{
		Chain:  "bnb",
		Amount: "1000",
	}

	resp := eval.Evaluate(context.Background(), req)
	// All fields should be present
	if resp.Allow == false {
		// check allow
	}
	if resp.Reasons == nil {
		t.Errorf("Reasons should not be nil")
	}
}

func TestDefaultRules_Production(t *testing.T) {
	// DefaultRules should return the canonical production rule set.
	ruleSet := DefaultRules(false)
	if len(ruleSet) == 0 {
		t.Errorf("DefaultRules should not be empty")
	}
	// Verify rule order: KillSwitchCheck runs first for fail-fast
	if ruleSet[0].Name() != "kill_switch_check" {
		t.Errorf("first rule should be kill_switch_check, got %s", ruleSet[0].Name())
	}
}

func TestDefaultRules_DevMode(t *testing.T) {
	// DefaultRules with devMode=true should enable HwAttested dev mode.
	ruleSet := DefaultRules(true)
	// Last rule should be HwAttested with DevMode enabled
	if ruleSet[len(ruleSet)-1].Name() != "hw_attested_required_for_cold" {
		t.Errorf("last rule should be hw_attested_required_for_cold, got %s", ruleSet[len(ruleSet)-1].Name())
	}
	hwAttested, ok := ruleSet[len(ruleSet)-1].(*rules.HwAttested)
	if !ok {
		t.Fatalf("last rule should be HwAttested type")
	}
	if !hwAttested.DevMode {
		t.Errorf("HwAttested.DevMode should be true for dev mode")
	}
}

func TestNew_CreatesEvaluator(t *testing.T) {
	// New should create an Evaluator with provided rules and querier.
	q := &fakeQuerier{}
	ruleSet := []rules.Rule{&rules.KillSwitchCheck{}}
	eval := New(q, ruleSet)

	if eval == nil {
		t.Errorf("New should return non-nil Evaluator")
	}
}
