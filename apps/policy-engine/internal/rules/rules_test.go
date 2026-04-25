package rules_test

import (
	"context"
	"encoding/hex"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/btcsuite/btcd/btcec/v2/ecdsa"
	"github.com/decred/dcrd/dcrec/secp256k1/v4"
	"golang.org/x/crypto/sha3"

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

	killSwitchEnabled    bool
	killSwitchEnabledErr error

	isColdReserveWallet    bool
	isColdReserveWalletErr error

	approvalsForWithdrawal    []db.ApprovalWithSigner
	approvalsForWithdrawalErr error

	hasActiveCeremony    bool
	hasActiveCeremonyErr error

	userRiskTier    string
	userRiskTierErr error
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

func (f *fakeQuerier) GetKillSwitchEnabled(_ context.Context) (bool, error) {
	return f.killSwitchEnabled, f.killSwitchEnabledErr
}

func (f *fakeQuerier) IsColdReserveWallet(_ context.Context, _ db.IsColdReserveWalletParams) (bool, error) {
	return f.isColdReserveWallet, f.isColdReserveWalletErr
}

func (f *fakeQuerier) GetApprovalsForWithdrawal(_ context.Context, _ pgtype.UUID) ([]db.ApprovalWithSigner, error) {
	return f.approvalsForWithdrawal, f.approvalsForWithdrawalErr
}

func (f *fakeQuerier) HasActiveCeremony(_ context.Context, _ string) (bool, error) {
	return f.hasActiveCeremony, f.hasActiveCeremonyErr
}

func (f *fakeQuerier) GetUserRiskTier(_ context.Context, _ pgtype.UUID) (string, error) {
	if f.userRiskTierErr != nil {
		return "low", f.userRiskTierErr
	}
	if f.userRiskTier == "" {
		return "low", nil
	}
	return f.userRiskTier, nil
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

// ── DestinationWhitelist hot_to_cold fast-path tests ─────────────────────────

func TestDestinationWhitelist_HotToCold(t *testing.T) {
	rule := rules.DestinationWhitelist{}
	ctx := context.Background()

	coldAddr := "0xCOLD0SAFE0000000000000000000000000000002"
	unknownAddr := "0xunknown000000000000000000000000000000099"

	tests := []struct {
		name     string
		req      rules.EvaluateRequest
		querier  *fakeQuerier
		wantPass bool
	}{
		{
			name:     "hot_to_cold — destination is registered cold_reserve — allowed (whitelist bypassed)",
			req:      rules.EvaluateRequest{OperationType: "hot_to_cold", DestinationAddr: coldAddr, Chain: "bnb"},
			querier:  &fakeQuerier{isColdReserveWallet: true},
			wantPass: true,
		},
		{
			name:     "hot_to_cold — destination not a cold_reserve wallet — denied",
			req:      rules.EvaluateRequest{OperationType: "hot_to_cold", DestinationAddr: unknownAddr, Chain: "bnb"},
			querier:  &fakeQuerier{isColdReserveWallet: false},
			wantPass: false,
		},
		{
			name:     "hot_to_cold — DB error — fail closed",
			req:      rules.EvaluateRequest{OperationType: "hot_to_cold", DestinationAddr: coldAddr, Chain: "bnb"},
			querier:  &fakeQuerier{isColdReserveWalletErr: errors.New("db down")},
			wantPass: false,
		},
		{
			name:     "standard withdrawal — cold address NOT in whitelist — denied (no fast-path)",
			req:      rules.EvaluateRequest{OperationType: "withdrawal", DestinationAddr: coldAddr, Chain: "bnb"},
			querier:  &fakeQuerier{whitelistCount: 5, whitelisted: false},
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

// generateTestSecp256k1Key generates a fresh secp256k1 key pair for tests using btcec.
// Returns the private key and the compressed public key as a lowercase hex string (no 0x prefix).
func generateTestSecp256k1Key(t *testing.T) (*secp256k1.PrivateKey, string) {
	t.Helper()
	priv, err := secp256k1.GeneratePrivateKey()
	if err != nil {
		t.Fatalf("generateTestSecp256k1Key: %v", err)
	}
	pubKeyHex := hex.EncodeToString(priv.PubKey().SerializeCompressed())
	return priv, pubKeyHex
}

// signAttestationBlob signs digest with privKey using btcec ECDSA SignCompact (65-byte).
// The production verifier accepts both 64-byte compact (R||S) and 65-byte (recov||R||S).
// We return the 65-byte form here; verifySecp256k1Sig strips the first byte automatically.
func signAttestationBlob(t *testing.T, priv *secp256k1.PrivateKey, digest []byte) []byte {
	t.Helper()
	// SignCompact returns 65 bytes: [recovery_flag || R(32) || S(32)]
	sig := ecdsa.SignCompact(priv, digest, true /* compressed */)
	return sig
}

// testAttestationDigest mirrors production attestationDigest function.
func testAttestationDigest(withdrawalID, destination, amount, chain string) []byte {
	h := sha3.NewLegacyKeccak256()
	h.Write([]byte(withdrawalID))
	h.Write([]byte(destination))
	h.Write([]byte(amount))
	h.Write([]byte(chain))
	return h.Sum(nil)
}

// makeApproval is a test helper that builds an ApprovalWithSigner row.
func makeApproval(opIDStr, signerAddr string, blobBytes []byte, attType *string) db.ApprovalWithSigner {
	var opID pgtype.UUID
	_ = opID.Scan(opIDStr)
	return db.ApprovalWithSigner{
		MultisigApproval: db.MultisigApproval{
			OpID:            opID,
			AttestationBlob: blobBytes,
			AttestationType: attType,
		},
		SignerAddress: signerAddr,
	}
}

func strPtr(s string) *string { return &s }

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

// ── HwAttested blob verification tests ───────────────────────────────────────

func TestHwAttested_BlobVerification(t *testing.T) {
	ctx := context.Background()

	const (
		wdID    = "c0000000-0000-0000-0000-000000000003"
		dest    = "0xDEAD000000000000000000000000000000000001"
		amount  = "50000"
		chain   = "bnb"
		opIDStr = "d0000000-0000-0000-0000-000000000004"
	)

	// Generate a real secp256k1 key pair for the test signer
	priv, pubKeyHex := generateTestSecp256k1Key(t)
	digest := testAttestationDigest(wdID, dest, amount, chain)
	validSig := signAttestationBlob(t, priv, digest)

	// Generate a different key pair — its signature should fail against pubKeyHex
	wrongPriv, _ := generateTestSecp256k1Key(t)
	wrongSig := signAttestationBlob(t, wrongPriv, digest)

	hwKey := &db.StaffSigningKey{HwAttested: true, Tier: db.TierCold, Address: pubKeyHex}

	tests := []struct {
		name     string
		rule     rules.HwAttested
		req      rules.EvaluateRequest
		querier  *fakeQuerier
		wantPass bool
	}{
		{
			name: "no withdrawalId — skips blob check",
			rule: rules.HwAttested{},
			req:  rules.EvaluateRequest{Tier: "cold", SignerAddress: pubKeyHex, Chain: chain},
			querier: &fakeQuerier{
				signingKey:             hwKey,
				approvalsForWithdrawal: nil,
			},
			wantPass: true,
		},
		{
			name: "withdrawalId with no approvals yet — skips blob check",
			rule: rules.HwAttested{},
			req:  rules.EvaluateRequest{Tier: "cold", SignerAddress: pubKeyHex, Chain: chain, WithdrawalID: wdID, DestinationAddr: dest, Amount: amount},
			querier: &fakeQuerier{
				signingKey:             hwKey,
				approvalsForWithdrawal: []db.ApprovalWithSigner{},
			},
			wantPass: true,
		},
		{
			name: "valid secp256k1 sig with ledger type — passes",
			rule: rules.HwAttested{},
			req:  rules.EvaluateRequest{Tier: "cold", SignerAddress: pubKeyHex, Chain: chain, WithdrawalID: wdID, DestinationAddr: dest, Amount: amount},
			querier: &fakeQuerier{
				signingKey: hwKey,
				approvalsForWithdrawal: []db.ApprovalWithSigner{
					makeApproval(opIDStr, pubKeyHex, validSig, strPtr("ledger")),
				},
			},
			wantPass: true,
		},
		{
			name: "valid secp256k1 sig with trezor type — passes",
			rule: rules.HwAttested{},
			req:  rules.EvaluateRequest{Tier: "cold", SignerAddress: pubKeyHex, Chain: chain, WithdrawalID: wdID, DestinationAddr: dest, Amount: amount},
			querier: &fakeQuerier{
				signingKey: hwKey,
				approvalsForWithdrawal: []db.ApprovalWithSigner{
					makeApproval(opIDStr, pubKeyHex, validSig, strPtr("trezor")),
				},
			},
			wantPass: true,
		},
		{
			name: "missing attestation_type — denied",
			rule: rules.HwAttested{},
			req:  rules.EvaluateRequest{Tier: "cold", SignerAddress: pubKeyHex, Chain: chain, WithdrawalID: wdID, DestinationAddr: dest, Amount: amount},
			querier: &fakeQuerier{
				signingKey: hwKey,
				approvalsForWithdrawal: []db.ApprovalWithSigner{
					makeApproval(opIDStr, pubKeyHex, validSig, nil),
				},
			},
			wantPass: false,
		},
		{
			name: "invalid attestation_type 'none' — denied",
			rule: rules.HwAttested{},
			req:  rules.EvaluateRequest{Tier: "cold", SignerAddress: pubKeyHex, Chain: chain, WithdrawalID: wdID, DestinationAddr: dest, Amount: amount},
			querier: &fakeQuerier{
				signingKey: hwKey,
				approvalsForWithdrawal: []db.ApprovalWithSigner{
					makeApproval(opIDStr, pubKeyHex, validSig, strPtr("none")),
				},
			},
			wantPass: false,
		},
		{
			name: "missing attestation_blob — denied",
			rule: rules.HwAttested{},
			req:  rules.EvaluateRequest{Tier: "cold", SignerAddress: pubKeyHex, Chain: chain, WithdrawalID: wdID, DestinationAddr: dest, Amount: amount},
			querier: &fakeQuerier{
				signingKey: hwKey,
				approvalsForWithdrawal: []db.ApprovalWithSigner{
					makeApproval(opIDStr, pubKeyHex, nil, strPtr("ledger")),
				},
			},
			wantPass: false,
		},
		{
			// wrongSig was produced by wrongPriv; the approval claims SignerAddress=pubKeyHex.
			// Verification fails: sig does not match the registered key's public key.
			name: "wrong signer key — sig fails verification",
			rule: rules.HwAttested{},
			req:  rules.EvaluateRequest{Tier: "cold", SignerAddress: pubKeyHex, Chain: chain, WithdrawalID: wdID, DestinationAddr: dest, Amount: amount},
			querier: &fakeQuerier{
				signingKey: hwKey,
				approvalsForWithdrawal: []db.ApprovalWithSigner{
					// blob signed by wrongPriv but approval claims signerAddress = pubKeyHex
					makeApproval(opIDStr, pubKeyHex, wrongSig, strPtr("ledger")),
				},
			},
			wantPass: false,
		},
		{
			name: "dev-mode — synthetic blob accepted",
			rule: rules.HwAttested{DevMode: true},
			req:  rules.EvaluateRequest{Tier: "cold", SignerAddress: pubKeyHex, Chain: chain, WithdrawalID: wdID, DestinationAddr: dest, Amount: amount},
			querier: &fakeQuerier{
				signingKey: hwKey,
				approvalsForWithdrawal: []db.ApprovalWithSigner{
					makeApproval(opIDStr, pubKeyHex, []byte("DEV_ATTESTATION_"+wdID), strPtr("ledger")),
				},
			},
			wantPass: true,
		},
		{
			name: "dev-mode OFF — synthetic blob rejected",
			rule: rules.HwAttested{DevMode: false},
			req:  rules.EvaluateRequest{Tier: "cold", SignerAddress: pubKeyHex, Chain: chain, WithdrawalID: wdID, DestinationAddr: dest, Amount: amount},
			querier: &fakeQuerier{
				signingKey: hwKey,
				approvalsForWithdrawal: []db.ApprovalWithSigner{
					makeApproval(opIDStr, pubKeyHex, []byte("DEV_ATTESTATION_"+wdID), strPtr("ledger")),
				},
			},
			wantPass: false,
		},
		{
			name: "DB error fetching approvals — fail closed",
			rule: rules.HwAttested{},
			req:  rules.EvaluateRequest{Tier: "cold", SignerAddress: pubKeyHex, Chain: chain, WithdrawalID: wdID, DestinationAddr: dest, Amount: amount},
			querier: &fakeQuerier{
				signingKey:                hwKey,
				approvalsForWithdrawalErr: errors.New("db down"),
			},
			wantPass: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			pass, reason, err := tc.rule.Check(ctx, tc.req, tc.querier)
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

// ── KillSwitchCheck tests ─────────────────────────────────────────────────────

func TestKillSwitchCheck(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name      string
		req       rules.EvaluateRequest
		querier   *fakeQuerier
		wantPass  bool
		wantApply bool
	}{
		{
			name:      "withdrawal — flag disabled — allowed",
			req:       rules.EvaluateRequest{OperationType: "withdrawal"},
			querier:   &fakeQuerier{killSwitchEnabled: false},
			wantPass:  true,
			wantApply: true,
		},
		{
			name:      "sweep — flag disabled — allowed",
			req:       rules.EvaluateRequest{OperationType: "sweep"},
			querier:   &fakeQuerier{killSwitchEnabled: false},
			wantPass:  true,
			wantApply: true,
		},
		{
			name:      "withdrawal — flag enabled — denied",
			req:       rules.EvaluateRequest{OperationType: "withdrawal"},
			querier:   &fakeQuerier{killSwitchEnabled: true},
			wantPass:  false,
			wantApply: true,
		},
		{
			name:      "sweep — flag enabled — denied",
			req:       rules.EvaluateRequest{OperationType: "sweep"},
			querier:   &fakeQuerier{killSwitchEnabled: true},
			wantPass:  false,
			wantApply: true,
		},
		{
			name:      "deposit operation — rule does not apply",
			req:       rules.EvaluateRequest{OperationType: "deposit"},
			querier:   &fakeQuerier{killSwitchEnabled: true},
			wantPass:  true, // N/A — AppliesTo false
			wantApply: false,
		},
		{
			name:      "empty operation type — rule does not apply",
			req:       rules.EvaluateRequest{},
			querier:   &fakeQuerier{killSwitchEnabled: true},
			wantPass:  true,
			wantApply: false,
		},
		{
			name:      "DB error — fail closed (denied)",
			req:       rules.EvaluateRequest{OperationType: "withdrawal"},
			querier:   &fakeQuerier{killSwitchEnabledErr: errors.New("db down")},
			wantPass:  false,
			wantApply: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rule := &rules.KillSwitchCheck{}
			if rule.AppliesTo(tc.req) != tc.wantApply {
				t.Fatalf("AppliesTo = %v, want %v", rule.AppliesTo(tc.req), tc.wantApply)
			}
			if !tc.wantApply {
				return
			}
			pass, reason, _ := rule.Check(ctx, tc.req, tc.querier)
			if pass != tc.wantPass {
				t.Errorf("pass = %v (reason: %q), want %v", pass, reason, tc.wantPass)
			}
		})
	}
}

// countingKillSwitchQuerier wraps fakeQuerier and counts GetKillSwitchEnabled calls.
type countingKillSwitchQuerier struct {
	*fakeQuerier
	counter *int
}

func (c *countingKillSwitchQuerier) GetKillSwitchEnabled(_ context.Context) (bool, error) {
	*c.counter++
	return c.fakeQuerier.GetKillSwitchEnabled(context.Background())
}

func TestKillSwitchCheck_CacheTTL(t *testing.T) {
	// Two successive calls within TTL should only query DB once (cache hit on 2nd).
	ctx := context.Background()
	callCount := 0
	cq := &countingKillSwitchQuerier{
		fakeQuerier: &fakeQuerier{killSwitchEnabled: false},
		counter:     &callCount,
	}

	rule := &rules.KillSwitchCheck{}
	req := rules.EvaluateRequest{OperationType: "withdrawal"}

	_, _, _ = rule.Check(ctx, req, cq)
	_, _, _ = rule.Check(ctx, req, cq)

	if callCount != 1 {
		t.Errorf("expected 1 DB call (cache hit on 2nd call), got %d", callCount)
	}
}

// ── CeremonyGate tests ────────────────────────────────────────────────────────

func TestCeremonyGate(t *testing.T) {
	rule := rules.CeremonyGate{}
	ctx := context.Background()

	tests := []struct {
		name      string
		req       rules.EvaluateRequest
		querier   *fakeQuerier
		wantPass  bool
		wantApply bool
	}{
		{
			name:      "withdrawal — no active ceremony — allowed",
			req:       rules.EvaluateRequest{OperationType: "withdrawal", Chain: "bnb"},
			querier:   &fakeQuerier{hasActiveCeremony: false},
			wantPass:  true,
			wantApply: true,
		},
		{
			name:      "withdrawal — active ceremony on chain — denied",
			req:       rules.EvaluateRequest{OperationType: "withdrawal", Chain: "bnb"},
			querier:   &fakeQuerier{hasActiveCeremony: true},
			wantPass:  false,
			wantApply: true,
		},
		{
			name:      "sweep — active ceremony — denied",
			req:       rules.EvaluateRequest{OperationType: "sweep", Chain: "sol"},
			querier:   &fakeQuerier{hasActiveCeremony: true},
			wantPass:  false,
			wantApply: true,
		},
		{
			name:      "hot_to_cold — active ceremony — denied",
			req:       rules.EvaluateRequest{OperationType: "hot_to_cold", Chain: "bnb"},
			querier:   &fakeQuerier{hasActiveCeremony: true},
			wantPass:  false,
			wantApply: true,
		},
		{
			name:      "deposit — rule does not apply",
			req:       rules.EvaluateRequest{OperationType: "deposit", Chain: "bnb"},
			querier:   &fakeQuerier{hasActiveCeremony: true},
			wantPass:  true, // N/A — AppliesTo false
			wantApply: false,
		},
		{
			name:      "withdrawal — no chain — rule does not apply",
			req:       rules.EvaluateRequest{OperationType: "withdrawal", Chain: ""},
			querier:   &fakeQuerier{hasActiveCeremony: true},
			wantPass:  true,
			wantApply: false,
		},
		{
			name:      "DB error — fail closed",
			req:       rules.EvaluateRequest{OperationType: "withdrawal", Chain: "bnb"},
			querier:   &fakeQuerier{hasActiveCeremonyErr: errors.New("db down")},
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

// ── AuthorizedSigner revoked-key tests ────────────────────────────────────────

func TestAuthorizedSigner_RevokedKey(t *testing.T) {
	// The SQL query filters revoked_at IS NULL, so the querier returns an error
	// (no rows) when the key is revoked. Verify the rule correctly denies.
	rule := rules.AuthorizedSigner{}
	ctx := context.Background()

	tests := []struct {
		name     string
		req      rules.EvaluateRequest
		querier  *fakeQuerier
		wantPass bool
	}{
		{
			name: "active key (revoked_at IS NULL) — allowed",
			req:  rules.EvaluateRequest{SignerAddress: "0xactive", Chain: "bnb", Tier: "hot"},
			querier: &fakeQuerier{signingKey: &db.StaffSigningKey{
				Address: "0xactive", Chain: db.ChainBnb, Tier: db.TierHot,
			}},
			wantPass: true,
		},
		{
			name: "revoked key — SQL returns no rows — denied",
			// When revoked_at IS NOT NULL, the DB query returns no row (ErrNoRows).
			// The querier simulates this by returning an error.
			req:      rules.EvaluateRequest{SignerAddress: "0xrevoked", Chain: "bnb", Tier: "hot"},
			querier:  &fakeQuerier{signingKeyErr: errors.New("no rows in result set")},
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

// ── AppliesTo() == false coverage tests ──────────────────────────────────────

func TestDailyLimit_AppliesTo_False(t *testing.T) {
	// DailyLimit.AppliesTo returns false when ActorStaffID is empty.
	rule := rules.DailyLimit{}
	req := rules.EvaluateRequest{Amount: "1000", Chain: "bnb"}
	if rule.AppliesTo(req) {
		t.Errorf("AppliesTo should be false when ActorStaffID is empty")
	}
}

func TestTimeLock_AppliesTo_False(t *testing.T) {
	// TimeLock.AppliesTo returns false when OperationType is not "" or "withdrawal".
	rule := rules.TimeLock{}
	tests := []struct {
		name  string
		opTyp string
	}{
		{name: "deposit", opTyp: "deposit"},
		{name: "sweep", opTyp: "sweep"},
		{name: "hot_to_cold", opTyp: "hot_to_cold"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := rules.EvaluateRequest{OperationType: tc.opTyp}
			if rule.AppliesTo(req) {
				t.Errorf("AppliesTo should be false for %s operation", tc.opTyp)
			}
		})
	}
}

func TestDestinationWhitelist_AppliesTo_False(t *testing.T) {
	// DestinationWhitelist.AppliesTo returns false when DestinationAddr or Chain is empty.
	rule := rules.DestinationWhitelist{}
	tests := []struct {
		name string
		addr string
		ch   string
	}{
		{name: "empty address", addr: "", ch: "bnb"},
		{name: "empty chain", addr: "0xaddr", ch: ""},
		{name: "both empty", addr: "", ch: ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := rules.EvaluateRequest{DestinationAddr: tc.addr, Chain: tc.ch}
			if rule.AppliesTo(req) {
				t.Errorf("AppliesTo should be false for empty fields")
			}
		})
	}
}

func TestHwAttested_AppliesTo_False(t *testing.T) {
	// HwAttested.AppliesTo returns false when Tier != "cold" or SignerAddress/Chain empty.
	rule := rules.HwAttested{}
	tests := []struct {
		name string
		tier string
		addr string
		ch   string
	}{
		{name: "hot tier", tier: "hot", addr: "0xsigner", ch: "bnb"},
		{name: "cold but no signer", tier: "cold", addr: "", ch: "bnb"},
		{name: "cold but no chain", tier: "cold", addr: "0xsigner", ch: ""},
		{name: "empty tier", tier: "", addr: "0xsigner", ch: "bnb"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := rules.EvaluateRequest{Tier: tc.tier, SignerAddress: tc.addr, Chain: tc.ch}
			if rule.AppliesTo(req) {
				t.Errorf("AppliesTo should be false")
			}
		})
	}
}

func TestAuthorizedSigner_AppliesTo_False(t *testing.T) {
	// AuthorizedSigner.AppliesTo returns false when SignerAddress, Chain, or Tier is empty.
	rule := rules.AuthorizedSigner{}
	tests := []struct {
		name string
		addr string
		ch   string
		tier string
	}{
		{name: "no signer", addr: "", ch: "bnb", tier: "hot"},
		{name: "no chain", addr: "0xsigner", ch: "", tier: "hot"},
		{name: "no tier", addr: "0xsigner", ch: "bnb", tier: ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := rules.EvaluateRequest{SignerAddress: tc.addr, Chain: tc.ch, Tier: tc.tier}
			if rule.AppliesTo(req) {
				t.Errorf("AppliesTo should be false")
			}
		})
	}
}

// ── Rule Name() interface coverage ───────────────────────────────────────────

func TestRuleNames(t *testing.T) {
	// Verify all rules implement Name() correctly (interface compliance).
	tests := []struct {
		rule     rules.Rule
		expected string
	}{
		{rule: &rules.AuthorizedSigner{}, expected: "authorized_signer"},
		{rule: &rules.DailyLimit{}, expected: "daily_limit"},
		{rule: &rules.DestinationWhitelist{}, expected: "destination_whitelist"},
		{rule: &rules.TimeLock{}, expected: "time_lock"},
		{rule: &rules.KillSwitchCheck{}, expected: "kill_switch_check"},
		{rule: &rules.CeremonyGate{}, expected: "ceremony_gate"},
		{rule: &rules.HwAttested{}, expected: "hw_attested_required_for_cold"},
	}
	for _, tc := range tests {
		if tc.rule.Name() != tc.expected {
			t.Errorf("Name() = %q, want %q", tc.rule.Name(), tc.expected)
		}
	}
}

// ── DailyLimit edge cases ────────────────────────────────────────────────────

func TestDailyLimit_RiskTier_Frozen(t *testing.T) {
	// When user risk tier is "frozen", rule should deny immediately with USER_FROZEN reason.
	rule := rules.DailyLimit{}
	ctx := context.Background()
	staffID := "a0000000-0000-0000-0000-000000000001"

	req := rules.EvaluateRequest{
		ActorStaffID: staffID,
		Amount:       "1",
		Chain:        "bnb",
		UserID:       "b0000000-0000-0000-0000-000000000001",
	}
	querier := &fakeQuerier{
		staffMember:   &db.GetStaffMemberRow{ID: uuidFromString(staffID), Role: db.RoleOperator},
		withdrawalSum: numericFromString("0"),
		userRiskTier:  "frozen",
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("frozen user should be denied")
	}
	if !strings.Contains(reason, "USER_FROZEN") {
		t.Errorf("reason should mention USER_FROZEN, got %q", reason)
	}
}

func TestDailyLimit_RiskTier_Medium(t *testing.T) {
	// User with "medium" risk tier should get 50% of base limit.
	rule := rules.DailyLimit{}
	ctx := context.Background()
	staffID := "a0000000-0000-0000-0000-000000000001"

	req := rules.EvaluateRequest{
		ActorStaffID: staffID,
		Amount:       "30000", // 30k for operator with medium risk = 0.5 * 50k = 25k limit
		Chain:        "bnb",
		UserID:       "b0000000-0000-0000-0000-000000000001",
	}
	querier := &fakeQuerier{
		staffMember:   &db.GetStaffMemberRow{ID: uuidFromString(staffID), Role: db.RoleOperator},
		withdrawalSum: numericFromString("0"),
		userRiskTier:  "medium",
	}

	pass, reason, err := rule.Check(ctx, req, querier)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pass {
		t.Errorf("30k should exceed 50%% limit (25k); reason: %q", reason)
	}
}

func TestDailyLimit_RiskTier_High(t *testing.T) {
	// User with "high" risk tier should get 20% of base limit.
	rule := rules.DailyLimit{}
	ctx := context.Background()
	staffID := "a0000000-0000-0000-0000-000000000001"

	req := rules.EvaluateRequest{
		ActorStaffID: staffID,
		Amount:       "15000", // 15k for operator with high risk = 0.2 * 50k = 10k limit
		Chain:        "bnb",
		UserID:       "b0000000-0000-0000-0000-000000000001",
	}
	querier := &fakeQuerier{
		staffMember:   &db.GetStaffMemberRow{ID: uuidFromString(staffID), Role: db.RoleOperator},
		withdrawalSum: numericFromString("0"),
		userRiskTier:  "high",
	}

	pass, reason, err := rule.Check(ctx, req, querier)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pass {
		t.Errorf("15k should exceed 20%% limit (10k); reason: %q", reason)
	}
}

func TestDailyLimit_RiskTierLookup_Error_FallsBackToBaseLimit(t *testing.T) {
	// When user risk tier lookup fails, should continue with base limit (fail-open for risk).
	rule := rules.DailyLimit{}
	ctx := context.Background()
	staffID := "a0000000-0000-0000-0000-000000000001"

	req := rules.EvaluateRequest{
		ActorStaffID: staffID,
		Amount:       "40000", // Within base 50k but would exceed if risk was applied
		Chain:        "bnb",
		UserID:       "b0000000-0000-0000-0000-000000000001",
	}
	querier := &fakeQuerier{
		staffMember:   &db.GetStaffMemberRow{ID: uuidFromString(staffID), Role: db.RoleOperator},
		withdrawalSum: numericFromString("0"),
		userRiskTierErr: errors.New("db down"),
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if !pass {
		t.Errorf("should pass with base limit when risk tier lookup fails; reason: %q", reason)
	}
}

func TestDailyLimit_NumericConversion_EdgeCases(t *testing.T) {
	// Test numeric conversion with exponent edge cases.
	rule := rules.DailyLimit{}
	ctx := context.Background()
	staffID := "a0000000-0000-0000-0000-000000000001"

	tests := []struct {
		name         string
		withdrawalSum string
		amount        string
		wantPass      bool
	}{
		{
			name:          "very small exponent withdrawal",
			withdrawalSum: "0.000001",
			amount:        "49999.999999",
			wantPass:      true, // sum is less than 50k
		},
		{
			name:          "withdraw at limit",
			withdrawalSum: "45000",
			amount:        "5000",
			wantPass:      true, // 45000 + 5000 = 50000 = limit
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := rules.EvaluateRequest{
				ActorStaffID: staffID,
				Amount:       tc.amount,
				Chain:        "bnb",
			}
			querier := &fakeQuerier{
				staffMember:   &db.GetStaffMemberRow{ID: uuidFromString(staffID), Role: db.RoleOperator},
				withdrawalSum: numericFromString(tc.withdrawalSum),
			}

			pass, _, _ := rule.Check(ctx, req, querier)
			if pass != tc.wantPass {
				t.Errorf("pass = %v, want %v", pass, tc.wantPass)
			}
		})
	}
}

// ── TimeLock edge cases ──────────────────────────────────────────────────────

func TestTimeLock_AppliesTo_WithdrawalDefault(t *testing.T) {
	// TimeLock.AppliesTo returns true when OperationType is empty (defaults to withdrawal).
	rule := rules.TimeLock{}
	req := rules.EvaluateRequest{OperationType: ""}
	if !rule.AppliesTo(req) {
		t.Errorf("AppliesTo should be true for empty operation type (withdrawal default)")
	}
}

func TestTimeLock_Invalid_WithdrawalID_Format(t *testing.T) {
	// Invalid withdrawal ID UUID format should be denied without DB access.
	rule := rules.TimeLock{}
	ctx := context.Background()

	req := rules.EvaluateRequest{
		WithdrawalID: "not-a-uuid",
		Tier:         "cold",
		Amount:       "1000",
	}
	querier := &fakeQuerier{}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("invalid uuid should be denied")
	}
	if !strings.Contains(reason, "invalid withdrawal_id format") {
		t.Errorf("reason should mention format error, got %q", reason)
	}
}

// ── DestinationWhitelist AppliesTo coverage ──────────────────────────────────

func TestDestinationWhitelist_Name(t *testing.T) {
	rule := rules.DestinationWhitelist{}
	if rule.Name() != "destination_whitelist" {
		t.Errorf("Name() = %q, want destination_whitelist", rule.Name())
	}
}

// ── HwAttested helper function coverage ──────────────────────────────────────

func TestTrimLeadingZeros(t *testing.T) {
	tests := []struct {
		name     string
		input    []byte
		expected []byte
	}{
		{
			name:     "all zeros",
			input:    []byte{0x00, 0x00, 0x00},
			expected: []byte{0x00}, // keeps at least one byte
		},
		{
			name:     "leading zeros",
			input:    []byte{0x00, 0x00, 0x12, 0x34},
			expected: []byte{0x12, 0x34},
		},
		{
			name:     "no leading zeros",
			input:    []byte{0x12, 0x34},
			expected: []byte{0x12, 0x34},
		},
		{
			name:     "single byte",
			input:    []byte{0x42},
			expected: []byte{0x42},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// trimLeadingZeros is not exported; test via HwAttested rules
			// by triggering signature verification paths that use it.
			// For now, skip this test pending helper export.
			// TODO: export trimLeadingZeros for unit testing, or use integration test.
		})
	}
}

// ── HwAttested dev-mode tests ────────────────────────────────────────────────

func TestHwAttested_DevMode_SyntheticBlob(t *testing.T) {
	rule := rules.HwAttested{DevMode: true}
	ctx := context.Background()

	withdrawalID := "a0000000-0000-0000-0000-000000000001"
	req := rules.EvaluateRequest{
		WithdrawalID:  withdrawalID,
		Tier:          "cold",
		SignerAddress: "0x021234567890abcdef",
		Chain:         "bnb",
		Amount:        "1000",
		DestinationAddr: "0xdest",
	}

	// Create approval with synthetic DEV_ATTESTATION_ blob
	prefix := "DEV_ATTESTATION_" + withdrawalID
	syntheticBlob := []byte(prefix + "_extra_data")
	attType := "ledger"
	approval := db.ApprovalWithSigner{
		MultisigApproval: db.MultisigApproval{
			AttestationBlob: syntheticBlob,
			AttestationType: &attType,
		},
		SignerAddress: "0x021234567890abcdef",
	}

	querier := &fakeQuerier{
		signingKey: &db.StaffSigningKey{
			Address:   "0x021234567890abcdef",
			HwAttested: true,
			Chain:     db.ChainBnb,
			Tier:      db.TierCold,
		},
		approvalsForWithdrawal: []db.ApprovalWithSigner{approval},
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if !pass {
		t.Errorf("dev-mode synthetic blob should pass; reason: %q", reason)
	}
}

func TestHwAttested_MissingAttestationType(t *testing.T) {
	rule := rules.HwAttested{DevMode: false}
	ctx := context.Background()

	withdrawalID := "a0000000-0000-0000-0000-000000000001"
	req := rules.EvaluateRequest{
		WithdrawalID:    withdrawalID,
		Tier:            "cold",
		SignerAddress:   "0x021234567890abcdef",
		Chain:           "bnb",
		Amount:          "1000",
		DestinationAddr: "0xdest",
	}

	// Approval with nil attestation_type
	approval := db.ApprovalWithSigner{
		MultisigApproval: db.MultisigApproval{
			AttestationBlob: []byte("somebytes"),
			AttestationType: nil, // missing
		},
		SignerAddress: "0x021234567890abcdef",
	}

	querier := &fakeQuerier{
		signingKey: &db.StaffSigningKey{
			Address:    "0x021234567890abcdef",
			HwAttested: true,
			Chain:      db.ChainBnb,
			Tier:       db.TierCold,
		},
		approvalsForWithdrawal: []db.ApprovalWithSigner{approval},
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("missing attestation_type should be denied")
	}
	if !strings.Contains(reason, "attestation_type is missing") {
		t.Errorf("reason should mention missing type, got %q", reason)
	}
}

func TestHwAttested_InvalidAttestationType(t *testing.T) {
	rule := rules.HwAttested{DevMode: false}
	ctx := context.Background()

	withdrawalID := "a0000000-0000-0000-0000-000000000001"
	req := rules.EvaluateRequest{
		WithdrawalID:    withdrawalID,
		Tier:            "cold",
		SignerAddress:   "0x021234567890abcdef",
		Chain:           "bnb",
		Amount:          "1000",
		DestinationAddr: "0xdest",
	}

	// Approval with invalid attestation_type
	invalidType := "invalid_type"
	approval := db.ApprovalWithSigner{
		MultisigApproval: db.MultisigApproval{
			AttestationBlob: []byte("somebytes"),
			AttestationType: &invalidType,
		},
		SignerAddress: "0x021234567890abcdef",
	}

	querier := &fakeQuerier{
		signingKey: &db.StaffSigningKey{
			Address:    "0x021234567890abcdef",
			HwAttested: true,
			Chain:      db.ChainBnb,
			Tier:       db.TierCold,
		},
		approvalsForWithdrawal: []db.ApprovalWithSigner{approval},
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("invalid attestation_type should be denied")
	}
	if !strings.Contains(reason, "is invalid") {
		t.Errorf("reason should mention invalid type, got %q", reason)
	}
}

func TestHwAttested_MissingAttestationBlob(t *testing.T) {
	rule := rules.HwAttested{DevMode: false}
	ctx := context.Background()

	withdrawalID := "a0000000-0000-0000-0000-000000000001"
	req := rules.EvaluateRequest{
		WithdrawalID:    withdrawalID,
		Tier:            "cold",
		SignerAddress:   "0x021234567890abcdef",
		Chain:           "bnb",
		Amount:          "1000",
		DestinationAddr: "0xdest",
	}

	// Approval with empty blob
	attType := "ledger"
	approval := db.ApprovalWithSigner{
		MultisigApproval: db.MultisigApproval{
			AttestationBlob: []byte{}, // empty
			AttestationType: &attType,
		},
		SignerAddress: "0x021234567890abcdef",
	}

	querier := &fakeQuerier{
		signingKey: &db.StaffSigningKey{
			Address:    "0x021234567890abcdef",
			HwAttested: true,
			Chain:      db.ChainBnb,
			Tier:       db.TierCold,
		},
		approvalsForWithdrawal: []db.ApprovalWithSigner{approval},
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("empty attestation_blob should be denied")
	}
	if !strings.Contains(reason, "attestation_blob is missing") {
		t.Errorf("reason should mention missing blob, got %q", reason)
	}
}

// ── AuthorizedSigner edge cases ──────────────────────────────────────────────

func TestAuthorizedSigner_Name(t *testing.T) {
	rule := rules.AuthorizedSigner{}
	if rule.Name() != "authorized_signer" {
		t.Errorf("Name() = %q, want authorized_signer", rule.Name())
	}
}

func TestAuthorizedSigner_TierMismatch(t *testing.T) {
	// Key found but tier does not match request (should not happen in practice
	// since the DB query filters by tier, but test for defensive coding).
	rule := rules.AuthorizedSigner{}
	ctx := context.Background()

	req := rules.EvaluateRequest{
		SignerAddress: "0x0x1234",
		Chain:         "bnb",
		Tier:          "cold",
	}
	querier := &fakeQuerier{
		signingKey: &db.StaffSigningKey{
			Address: "0x0x1234",
			Chain:   db.ChainBnb,
			Tier:    db.TierHot, // mismatch: request is cold, key is hot
		},
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("tier mismatch should be denied")
	}
	if !strings.Contains(reason, "tier mismatch") {
		t.Errorf("reason should mention tier mismatch, got %q", reason)
	}
}

func TestSafeSuffix_StringShorterThanN(t *testing.T) {
	// safeSuffix should return the whole string when len(s) <= n.
	// This tests the helper function via the rules that use it.
	rule := rules.DestinationWhitelist{}
	ctx := context.Background()

	req := rules.EvaluateRequest{
		OperationType:   "sweep",
		DestinationAddr: "0xA", // very short address
		Chain:           "bnb",
	}
	querier := &fakeQuerier{
		isOperationalWallet: false,
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("short address not in operational wallet should be denied")
	}
	// safeSuffix is called to redact the address; verify reason is constructed
	if !strings.Contains(reason, "not a registered operational wallet") {
		t.Errorf("reason should mention operational wallet, got %q", reason)
	}
}

// ── TimeLock uncovered branches ──────────────────────────────────────────────

func TestTimeLock_NoLockNeeded_Hot_SmallAmount(t *testing.T) {
	// Hot tier with amount < 50k threshold should not require lock.
	rule := rules.TimeLock{}
	ctx := context.Background()

	req := rules.EvaluateRequest{
		Tier:   "hot",
		Amount: "10000",
	}
	querier := &fakeQuerier{}

	pass, _, _ := rule.Check(ctx, req, querier)
	if !pass {
		t.Errorf("hot tier small amount should pass without lock")
	}
}

func TestTimeLock_ColdTier_NoWithdrawalRecord(t *testing.T) {
	// Cold tier requires lock; no withdrawal record means deny with guidance.
	rule := rules.TimeLock{}
	ctx := context.Background()

	req := rules.EvaluateRequest{
		Tier:   "cold",
		Amount: "1000",
		// no WithdrawalID
	}
	querier := &fakeQuerier{}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("cold tier should require lock")
	}
	if !strings.Contains(reason, "time-lock required") {
		t.Errorf("reason should indicate lock required, got %q", reason)
	}
}

func TestTimeLock_WithdrawalRecord_TimeLockNotSet(t *testing.T) {
	// Withdrawal exists but TimeLockExpiresAt is not set (NULL).
	rule := rules.TimeLock{}
	ctx := context.Background()

	withdrawalID := "a0000000-0000-0000-0000-000000000001"
	req := rules.EvaluateRequest{
		WithdrawalID: withdrawalID,
		Tier:         "cold",
		Amount:       "1000",
	}

	// Withdrawal with NULL time_lock_expires_at
	querier := &fakeQuerier{
		withdrawal: &db.GetWithdrawalRow{
			TimeLockExpiresAt: pgtype.Timestamptz{Valid: false}, // NULL
		},
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("withdrawal without lock should be denied")
	}
	if !strings.Contains(reason, "time_lock_expires_at not set") {
		t.Errorf("reason should mention lock not set, got %q", reason)
	}
}

func TestTimeLock_WithdrawalRecord_LockExpired(t *testing.T) {
	// Withdrawal exists with lock time in the past (expired).
	rule := rules.TimeLock{}
	ctx := context.Background()

	withdrawalID := "a0000000-0000-0000-0000-000000000001"
	req := rules.EvaluateRequest{
		WithdrawalID: withdrawalID,
		Tier:         "cold",
		Amount:       "1000",
	}

	expiredTime := time.Now().Add(-1 * time.Hour) // past
	querier := &fakeQuerier{
		withdrawal: &db.GetWithdrawalRow{
			TimeLockExpiresAt: pgtype.Timestamptz{
				Time:  expiredTime,
				Valid: true,
			},
		},
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if !pass {
		t.Errorf("expired lock should pass; reason: %q", reason)
	}
}

// ── DailyLimit.Check() uncovered branches ────────────────────────────────────

func TestDailyLimit_InvalidAmountString(t *testing.T) {
	// Request with unparseable amount string.
	rule := rules.DailyLimit{}
	ctx := context.Background()
	staffID := "a0000000-0000-0000-0000-000000000001"

	req := rules.EvaluateRequest{
		ActorStaffID: staffID,
		Amount:       "not_a_number",
		Chain:        "bnb",
	}
	querier := &fakeQuerier{
		staffMember:   &db.GetStaffMemberRow{ID: uuidFromString(staffID), Role: db.RoleOperator},
		withdrawalSum: numericFromString("0"),
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("invalid amount should be denied")
	}
	if !strings.Contains(reason, "invalid amount") {
		t.Errorf("reason should mention invalid amount, got %q", reason)
	}
}

func TestDailyLimit_SumWithdrawalsError(t *testing.T) {
	// Database error when querying withdrawal sum.
	rule := rules.DailyLimit{}
	ctx := context.Background()
	staffID := "a0000000-0000-0000-0000-000000000001"

	req := rules.EvaluateRequest{
		ActorStaffID: staffID,
		Amount:       "1000",
		Chain:        "bnb",
	}
	querier := &fakeQuerier{
		staffMember:      &db.GetStaffMemberRow{ID: uuidFromString(staffID), Role: db.RoleOperator},
		withdrawalSumErr: errors.New("db connection lost"),
	}

	pass, _, err := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("DB error should be denied")
	}
	if err == nil {
		t.Errorf("should return error when DB fails")
	}
}

func TestDailyLimit_NullNumeric_TreatedAsZero(t *testing.T) {
	// Database returns null/invalid numeric; numericToString returns "0".
	rule := rules.DailyLimit{}
	ctx := context.Background()
	staffID := "a0000000-0000-0000-0000-000000000001"

	req := rules.EvaluateRequest{
		ActorStaffID: staffID,
		Amount:       "1000",
		Chain:        "bnb",
	}

	// Create a null numeric (Valid=false)
	nullNumeric := pgtype.Numeric{Valid: false}

	querier := &fakeQuerier{
		staffMember:   &db.GetStaffMemberRow{ID: uuidFromString(staffID), Role: db.RoleOperator},
		withdrawalSum: nullNumeric,
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if !pass {
		t.Errorf("null sum should be treated as 0 and pass; reason: %q", reason)
	}
}

// ── HwAttested crypto error paths ────────────────────────────────────────────

func TestHwAttested_SigningKeyNotFound(t *testing.T) {
	// Signing key lookup fails for cold tier.
	rule := rules.HwAttested{DevMode: false}
	ctx := context.Background()

	req := rules.EvaluateRequest{
		Tier:          "cold",
		SignerAddress: "0x021234567890abcdef",
		Chain:         "bnb",
	}
	querier := &fakeQuerier{
		signingKeyErr: errors.New("no rows"),
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("missing signing key should be denied")
	}
	if !strings.Contains(reason, "signing key not found") {
		t.Errorf("reason should mention key not found, got %q", reason)
	}
}

func TestHwAttested_NotHardwareAttested(t *testing.T) {
	// Key found but hw_attested flag is false.
	rule := rules.HwAttested{DevMode: false}
	ctx := context.Background()

	req := rules.EvaluateRequest{
		Tier:          "cold",
		SignerAddress: "0x021234567890abcdef",
		Chain:         "bnb",
	}
	querier := &fakeQuerier{
		signingKey: &db.StaffSigningKey{
			Address:    "0x021234567890abcdef",
			Chain:      db.ChainBnb,
			Tier:       db.TierCold,
			HwAttested: false, // not attested
		},
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("non-hw-attested key should be denied")
	}
	if !strings.Contains(reason, "hw_attested=false") {
		t.Errorf("reason should mention hw_attested, got %q", reason)
	}
}

func TestHwAttested_NoApprovals(t *testing.T) {
	// Withdrawal exists but has no approvals yet (first approval being submitted).
	rule := rules.HwAttested{DevMode: false}
	ctx := context.Background()

	withdrawalID := "a0000000-0000-0000-0000-000000000001"
	req := rules.EvaluateRequest{
		WithdrawalID:    withdrawalID,
		Tier:            "cold",
		SignerAddress:   "0x021234567890abcdef",
		Chain:           "bnb",
		Amount:          "1000",
		DestinationAddr: "0xdest",
	}
	querier := &fakeQuerier{
		signingKey: &db.StaffSigningKey{
			Address:    "0x021234567890abcdef",
			Chain:      db.ChainBnb,
			Tier:       db.TierCold,
			HwAttested: true,
		},
		approvalsForWithdrawal: []db.ApprovalWithSigner{}, // no approvals yet
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if !pass {
		t.Errorf("no approvals yet should pass (deferred check); reason: %q", reason)
	}
}

// ── DestinationWhitelist edge cases ──────────────────────────────────────────

func TestDestinationWhitelist_CountError(t *testing.T) {
	// Error when counting whitelist entries.
	rule := rules.DestinationWhitelist{}
	ctx := context.Background()

	req := rules.EvaluateRequest{
		OperationType:   "withdrawal",
		DestinationAddr: "0xdest",
		Chain:           "bnb",
	}
	querier := &fakeQuerier{
		whitelistCountErr: errors.New("db down"),
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("count error should be denied")
	}
	if !strings.Contains(reason, "failed to count") {
		t.Errorf("reason should mention count error, got %q", reason)
	}
}

func TestDestinationWhitelist_EmptyWhitelistDevMode(t *testing.T) {
	// Whitelist is empty (dev mode) — all destinations allowed.
	rule := rules.DestinationWhitelist{}
	ctx := context.Background()

	req := rules.EvaluateRequest{
		OperationType:   "withdrawal",
		DestinationAddr: "0xanything",
		Chain:           "bnb",
	}
	querier := &fakeQuerier{
		whitelistCount: 0, // empty whitelist
		whitelisted:    false,
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if !pass {
		t.Errorf("empty whitelist should allow all (dev mode); reason: %q", reason)
	}
}

func TestDestinationWhitelist_QueryError(t *testing.T) {
	// Error when querying destination whitelist.
	rule := rules.DestinationWhitelist{}
	ctx := context.Background()

	req := rules.EvaluateRequest{
		OperationType:   "withdrawal",
		DestinationAddr: "0xdest",
		Chain:           "bnb",
	}
	querier := &fakeQuerier{
		whitelistCount: 10, // non-empty whitelist
		whitelistedErr: errors.New("db down"),
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("query error should be denied")
	}
	if !strings.Contains(reason, "failed to query") {
		t.Errorf("reason should mention query error, got %q", reason)
	}
}

// ── TimeLock timeLockRequired helper coverage ────────────────────────────────

func TestTimeLockRequired_UnknownTier(t *testing.T) {
	// timeLockRequired returns 0 for unknown tier (default case).
	// Test by checking that an unknown tier + any amount passes without lock.
	rule := rules.TimeLock{}
	ctx := context.Background()

	req := rules.EvaluateRequest{
		Tier:   "unknown_tier", // not "cold" or "hot"
		Amount: "1000000",      // large amount
		// no WithdrawalID
	}
	querier := &fakeQuerier{}

	pass, _, _ := rule.Check(ctx, req, querier)
	if !pass {
		t.Errorf("unknown tier should default to no lock required")
	}
}

func TestTimeLockRequired_HotWithInvalidAmount(t *testing.T) {
	// Hot tier with unparseable amount should treat as large (fail-safe).
	rule := rules.TimeLock{}
	ctx := context.Background()

	req := rules.EvaluateRequest{
		Tier:           "hot",
		Amount:         "not_a_number",
		WithdrawalID:   "",
		OperationType:  "withdrawal",
	}
	querier := &fakeQuerier{}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("unparseable hot amount should require lock (fail-safe)")
	}
	if !strings.Contains(reason, "time-lock required") {
		t.Errorf("reason should indicate lock required, got %q", reason)
	}
}

// ── HwAttested crypto edge cases ─────────────────────────────────────────────

func TestHwAttested_InvalidWithdrawalIDFormat(t *testing.T) {
	// Withdrawal ID that cannot be parsed as UUID.
	rule := rules.HwAttested{DevMode: false}
	ctx := context.Background()

	req := rules.EvaluateRequest{
		WithdrawalID:    "not-a-uuid",
		Tier:            "cold",
		SignerAddress:   "0x021234567890abcdef",
		Chain:           "bnb",
	}
	querier := &fakeQuerier{
		signingKey: &db.StaffSigningKey{
			Address:    "0x021234567890abcdef",
			Chain:      db.ChainBnb,
			Tier:       db.TierCold,
			HwAttested: true,
		},
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("invalid UUID should be denied")
	}
	if !strings.Contains(reason, "invalid withdrawal_id UUID format") {
		t.Errorf("reason should mention UUID format, got %q", reason)
	}
}

func TestHwAttested_GetApprovalsError(t *testing.T) {
	// Error when fetching approvals for withdrawal.
	rule := rules.HwAttested{DevMode: false}
	ctx := context.Background()

	withdrawalID := "a0000000-0000-0000-0000-000000000001"
	req := rules.EvaluateRequest{
		WithdrawalID:    withdrawalID,
		Tier:            "cold",
		SignerAddress:   "0x021234567890abcdef",
		Chain:           "bnb",
	}
	querier := &fakeQuerier{
		signingKey: &db.StaffSigningKey{
			Address:    "0x021234567890abcdef",
			Chain:      db.ChainBnb,
			Tier:       db.TierCold,
			HwAttested: true,
		},
		approvalsForWithdrawalErr: errors.New("db connection lost"),
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("approvals fetch error should be denied")
	}
	if !strings.Contains(reason, "failed to load approvals") {
		t.Errorf("reason should mention load error, got %q", reason)
	}
}

func TestHwAttested_SignatureVerification_HighBitSet(t *testing.T) {
	// Test signature verification with high-bit values that require DER padding.
	// Use a known valid secp256k1 signature and key.
	rule := rules.HwAttested{DevMode: false}
	ctx := context.Background()

	withdrawalID := "a0000000-0000-0000-0000-000000000001"
	destination := "0xdest_address"
	amount := "1000"
	chain := "bnb"

	// Generate a real secp256k1 key pair
	priv, pubKeyHex := generateTestSecp256k1Key(t)

	// Sign the attestation digest
	digest := testAttestationDigest(withdrawalID, destination, amount, chain)
	sig := signAttestationBlob(t, priv, digest)

	// Create approval with valid signature
	attType := "ledger"
	approval := db.ApprovalWithSigner{
		MultisigApproval: db.MultisigApproval{
			AttestationBlob: sig,
			AttestationType: &attType,
		},
		SignerAddress: pubKeyHex,
	}

	req := rules.EvaluateRequest{
		WithdrawalID:    withdrawalID,
		Tier:            "cold",
		SignerAddress:   pubKeyHex,
		Chain:           chain,
		Amount:          amount,
		DestinationAddr: destination,
	}

	querier := &fakeQuerier{
		signingKey: &db.StaffSigningKey{
			Address:    pubKeyHex,
			Chain:      db.ChainBnb,
			Tier:       db.TierCold,
			HwAttested: true,
		},
		approvalsForWithdrawal: []db.ApprovalWithSigner{approval},
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if !pass {
		t.Errorf("valid secp256k1 signature should pass; reason: %q", reason)
	}
}

func TestHwAttested_InvalidPublicKeyHex(t *testing.T) {
	// Signer address is not valid hex.
	rule := rules.HwAttested{DevMode: false}
	ctx := context.Background()

	withdrawalID := "a0000000-0000-0000-0000-000000000001"
	req := rules.EvaluateRequest{
		WithdrawalID:    withdrawalID,
		Tier:            "cold",
		SignerAddress:   "not_valid_hex", // invalid
		Chain:           "bnb",
	}
	querier := &fakeQuerier{
		signingKey: &db.StaffSigningKey{
			Address:    "not_valid_hex",
			Chain:      db.ChainBnb,
			Tier:       db.TierCold,
			HwAttested: true,
		},
		approvalsForWithdrawal: []db.ApprovalWithSigner{
			{
				MultisigApproval: db.MultisigApproval{
					AttestationBlob: []byte("somesig"),
					AttestationType: strPtr("ledger"),
				},
				SignerAddress: "not_valid_hex",
			},
		},
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("invalid hex should be denied")
	}
	if !strings.Contains(reason, "not a valid hex public key") {
		t.Errorf("reason should mention hex error, got %q", reason)
	}
}

func TestHwAttested_InvalidSignatureLength(t *testing.T) {
	// Signature blob is wrong length (not 64 or 65 bytes).
	rule := rules.HwAttested{DevMode: false}
	ctx := context.Background()

	withdrawalID := "a0000000-0000-0000-0000-000000000001"

	// Generate a real key for valid hex
	_, pubKeyHex := generateTestSecp256k1Key(t)

	req := rules.EvaluateRequest{
		WithdrawalID:    withdrawalID,
		Tier:            "cold",
		SignerAddress:   pubKeyHex,
		Chain:           "bnb",
		Amount:          "1000",
		DestinationAddr: "0xdest",
	}
	querier := &fakeQuerier{
		signingKey: &db.StaffSigningKey{
			Address:    pubKeyHex,
			Chain:      db.ChainBnb,
			Tier:       db.TierCold,
			HwAttested: true,
		},
		approvalsForWithdrawal: []db.ApprovalWithSigner{
			{
				MultisigApproval: db.MultisigApproval{
					AttestationBlob: []byte{0x01, 0x02}, // too short
					AttestationType: strPtr("ledger"),
				},
				SignerAddress: pubKeyHex,
			},
		},
	}

	pass, reason, _ := rule.Check(ctx, req, querier)
	if pass {
		t.Errorf("invalid signature length should be denied")
	}
	if !strings.Contains(reason, "must be 64 or 65 bytes") {
		t.Errorf("reason should mention length requirement, got %q", reason)
	}
}
