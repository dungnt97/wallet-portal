// hw_attested.go — Enforces hardware-wallet attestation for cold-tier approvals.
//
// When tier='cold' and a withdrawalId is present:
//  1. Look up the signer's registered public key (secp256k1 compressed hex) via GetSigningKeyByAddress.
//  2. Fetch all multisig_approvals for the withdrawal via GetApprovalsForWithdrawal.
//  3. For each approval:
//     - attestation_type must be 'ledger' or 'trezor'.
//     - attestation_blob must be non-nil.
//     - blob must be a valid secp256k1 ECDSA signature over keccak256(withdrawalId||destination||amount||chain).
//  4. Dev-mode shortcut (DevMode=true / POLICY_DEV_MODE=true):
//     accept blob that starts with "DEV_ATTESTATION_" + withdrawalId, no crypto check.
//
// Hot-tier operations: rule does not apply (AppliesTo returns false).
// First approval (approvals list empty): blob check skipped — blob persisted after this call.
package rules

import (
	"bytes"
	"context"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/btcsuite/btcd/btcec/v2/ecdsa"
	"github.com/decred/dcrd/dcrec/secp256k1/v4"
	"golang.org/x/crypto/sha3"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/wallet-portal/policy-engine/internal/db"
)

// HwAttested enforces that cold-tier signers use a hardware-attested key AND
// that every existing approval for the withdrawal carries a valid attestation blob.
// Set DevMode=true to accept synthetic blobs for local development.
type HwAttested struct {
	DevMode bool
}

func (HwAttested) Name() string { return "hw_attested_required_for_cold" }

// AppliesTo triggers for cold-tier requests with a signer address and chain.
func (HwAttested) AppliesTo(req EvaluateRequest) bool {
	return req.Tier == "cold" && req.SignerAddress != "" && req.Chain != ""
}

// Check performs:
//  1. hw_attested flag on the signing key (original behaviour).
//  2. Attestation blob verification for all existing approvals (Slice 7 addition).
func (r HwAttested) Check(ctx context.Context, req EvaluateRequest, q db.Querier) (bool, string, error) {
	// ── 1. hw_attested flag on signing key ────────────────────────────────────
	key, err := q.GetSigningKeyByAddress(ctx, db.GetSigningKeyByAddressParams{
		Address: req.SignerAddress,
		Column2: db.Chain(req.Chain),
		Column3: db.Tier(req.Tier),
	})
	if err != nil {
		return false, "signing key not found; hw_attested check cannot proceed", nil
	}

	if !key.HwAttested {
		return false, "cold-tier operations require a hardware-attested signing key (hw_attested=false)", nil
	}

	// ── 2. Blob verification — only when a withdrawal record exists ────────────
	// At withdrawal *creation* there is no withdrawalId yet; skip blob checks.
	if req.WithdrawalID == "" {
		return true, "", nil
	}

	var wdUUID pgtype.UUID
	if err := wdUUID.Scan(req.WithdrawalID); err != nil {
		return false, "invalid withdrawal_id UUID format", nil
	}

	approvals, err := q.GetApprovalsForWithdrawal(ctx, wdUUID)
	if err != nil {
		return false, fmt.Sprintf("failed to load approvals: %v", err), nil
	}

	// No approvals yet (first approval being submitted) — blob check deferred.
	// admin-api persists the blob on the current INSERT before the next execute check.
	if len(approvals) == 0 {
		return true, "", nil
	}

	// Compute the expected digest once; each approval's blob must sign this.
	digest := attestationDigest(req.WithdrawalID, req.DestinationAddr, req.Amount, req.Chain)

	for _, approval := range approvals {
		if reason := r.verifyApproval(req.WithdrawalID, approval, digest); reason != "" {
			return false, reason, nil
		}
	}

	return true, "", nil
}

// attestationDigest computes keccak256(withdrawalId || destination || amount || chain).
// Byte layout: UTF-8 encoded strings concatenated without separators.
func attestationDigest(withdrawalID, destination, amount, chain string) []byte {
	h := sha3.NewLegacyKeccak256()
	h.Write([]byte(withdrawalID))
	h.Write([]byte(destination))
	h.Write([]byte(amount))
	h.Write([]byte(chain))
	return h.Sum(nil)
}

// verifyApproval validates a single approval row.
// Returns "" on success, a human-readable denial reason on failure.
func (r HwAttested) verifyApproval(withdrawalID string, approval db.ApprovalWithSigner, digest []byte) string {
	// attestation_type must be 'ledger' or 'trezor'
	if approval.AttestationType == nil {
		return fmt.Sprintf("approval %s: attestation_type is missing (required for cold-tier)", fmtApprovalID(approval.ID))
	}
	aType := *approval.AttestationType
	if aType != "ledger" && aType != "trezor" {
		return fmt.Sprintf("approval %s: attestation_type '%s' is invalid (must be 'ledger' or 'trezor')", fmtApprovalID(approval.ID), aType)
	}

	// attestation_blob must be present
	if len(approval.AttestationBlob) == 0 {
		return fmt.Sprintf("approval %s: attestation_blob is missing (required for cold-tier)", fmtApprovalID(approval.ID))
	}

	// Dev-mode shortcut: accept synthetic blob without crypto verification
	if r.DevMode {
		prefix := "DEV_ATTESTATION_" + withdrawalID
		if bytes.HasPrefix(approval.AttestationBlob, []byte(prefix)) {
			return "" // accepted
		}
	}

	// Cryptographic verification via secp256k1 (btcec/v2)
	if reason := verifySecp256k1Sig(approval.SignerAddress, digest, approval.AttestationBlob); reason != "" {
		return fmt.Sprintf("approval %s: %s", fmtApprovalID(approval.ID), reason)
	}

	return ""
}

// verifySecp256k1Sig verifies that sig is a valid secp256k1 ECDSA signature of digest
// by the key identified by pubKeyHex (compressed 33-byte hex, optionally 0x-prefixed).
// sig is expected to be 64 bytes (R||S compact) or 65 bytes (recovery byte || R || S).
func verifySecp256k1Sig(pubKeyHex string, digest, sig []byte) string {
	// Strip 0x prefix
	keyHex := strings.TrimPrefix(pubKeyHex, "0x")
	keyBytes, err := hex.DecodeString(keyHex)
	if err != nil || len(keyBytes) == 0 {
		return "signer_address is not a valid hex public key"
	}

	// Parse secp256k1 compressed public key via btcec
	pubKey, err := secp256k1.ParsePubKey(keyBytes)
	if err != nil {
		return fmt.Sprintf("failed to parse secp256k1 public key: %v", err)
	}

	// Normalise signature: 64-byte compact R||S or 65-byte (drop recovery byte at index 0)
	rawSig := sig
	if len(rawSig) == 65 {
		rawSig = rawSig[1:] // drop recovery byte
	}
	if len(rawSig) != 64 {
		return fmt.Sprintf("attestation_blob must be 64 or 65 bytes, got %d", len(sig))
	}

	// Reconstruct DER signature from compact R||S for btcec verification
	btcSig, err := ecdsa.ParseDERSignature(compactToDER(rawSig))
	if err != nil {
		return fmt.Sprintf("failed to parse signature: %v", err)
	}

	if !btcSig.Verify(digest, pubKey) {
		return "attestation_blob signature verification failed"
	}
	return ""
}

// compactToDER converts a 64-byte compact secp256k1 signature (R||S) to DER encoding.
// DER format: 0x30 [total-len] 0x02 [r-len] [r-bytes] 0x02 [s-len] [s-bytes]
func compactToDER(compact []byte) []byte {
	r := compact[:32]
	s := compact[32:]

	// Trim leading zeros, but ensure at least one byte
	r = trimLeadingZeros(r)
	s = trimLeadingZeros(s)

	// Prepend 0x00 if high bit set (DER positive integer requirement)
	if len(r) > 0 && r[0]&0x80 != 0 {
		r = append([]byte{0x00}, r...)
	}
	if len(s) > 0 && s[0]&0x80 != 0 {
		s = append([]byte{0x00}, s...)
	}

	der := make([]byte, 0, 6+len(r)+len(s))
	der = append(der, 0x30)
	der = append(der, byte(4+len(r)+len(s)))
	der = append(der, 0x02, byte(len(r)))
	der = append(der, r...)
	der = append(der, 0x02, byte(len(s)))
	der = append(der, s...)
	return der
}

func trimLeadingZeros(b []byte) []byte {
	for len(b) > 1 && b[0] == 0 {
		b = b[1:]
	}
	return b
}

// fmtApprovalID returns a short hex prefix of a UUID for readable error messages.
func fmtApprovalID(u pgtype.UUID) string {
	if !u.Valid {
		return "<invalid>"
	}
	return hex.EncodeToString(u.Bytes[:4]) // first 4 bytes (8 hex chars) sufficient
}
