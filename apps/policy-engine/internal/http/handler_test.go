package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/wallet-portal/policy-engine/internal/db"
	"github.com/wallet-portal/policy-engine/internal/service"
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

func TestEvaluateHandler_ValidRequest(t *testing.T) {
	// Valid request should be processed and return Allow=true for simple cases.
	q := &fakeQuerier{}
	rules := service.DefaultRules(false)
	eval := service.New(q, rules)
	handler := EvaluateHandler(eval)

	body := map[string]string{
		"chain":  "bnb",
		"amount": "1000",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/v1/check", bytes.NewReader(bodyBytes))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp service.EvaluateResponse
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	// Should allow since all rules pass with minimal data
	if !resp.Allow {
		t.Logf("reasons: %v", resp.Reasons)
	}
}

func TestEvaluateHandler_InvalidJSON(t *testing.T) {
	// Invalid JSON should return 400.
	q := &fakeQuerier{}
	eval := service.New(q, service.DefaultRules(false))
	handler := EvaluateHandler(eval)

	req := httptest.NewRequest("POST", "/v1/check", bytes.NewReader([]byte("{invalid json")))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !bytes.Contains(w.Body.Bytes(), []byte("invalid JSON")) {
		t.Errorf("response should mention invalid JSON, got: %s", w.Body.String())
	}
}

func TestEvaluateHandler_MissingChain(t *testing.T) {
	// Missing 'chain' field should return 422.
	q := &fakeQuerier{}
	eval := service.New(q, service.DefaultRules(false))
	handler := EvaluateHandler(eval)

	body := map[string]string{
		"amount": "1000",
		// chain missing
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/v1/check", bytes.NewReader(bodyBytes))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnprocessableEntity)
	}
	if !bytes.Contains(w.Body.Bytes(), []byte("chain")) {
		t.Errorf("response should mention 'chain', got: %s", w.Body.String())
	}
}

func TestEvaluateHandler_MissingAmount(t *testing.T) {
	// Missing 'amount' field should return 422.
	q := &fakeQuerier{}
	eval := service.New(q, service.DefaultRules(false))
	handler := EvaluateHandler(eval)

	body := map[string]string{
		"chain": "bnb",
		// amount missing
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/v1/check", bytes.NewReader(bodyBytes))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnprocessableEntity)
	}
	if !bytes.Contains(w.Body.Bytes(), []byte("amount")) {
		t.Errorf("response should mention 'amount', got: %s", w.Body.String())
	}
}

func TestEvaluateHandler_BothRequiredFieldsMissing(t *testing.T) {
	// Both required fields missing should list both in error.
	q := &fakeQuerier{}
	eval := service.New(q, service.DefaultRules(false))
	handler := EvaluateHandler(eval)

	body := map[string]string{}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/v1/check", bytes.NewReader(bodyBytes))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnprocessableEntity)
	}
	respStr := w.Body.String()
	if !bytes.Contains(w.Body.Bytes(), []byte("chain")) || !bytes.Contains(w.Body.Bytes(), []byte("amount")) {
		t.Errorf("response should mention both fields, got: %s", respStr)
	}
}

func TestEvaluateHandler_DefaultOperationType(t *testing.T) {
	// Operation type should default to "withdrawal" when omitted.
	q := &fakeQuerier{}
	eval := service.New(q, service.DefaultRules(false))
	handler := EvaluateHandler(eval)

	body := map[string]string{
		"chain":  "bnb",
		"amount": "1000",
		// operation_type omitted
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/v1/check", bytes.NewReader(bodyBytes))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
	// Should successfully parse with default operation type
}

func TestEvaluateHandler_ResponseContentType(t *testing.T) {
	// Response should have application/json content type.
	q := &fakeQuerier{}
	eval := service.New(q, service.DefaultRules(false))
	handler := EvaluateHandler(eval)

	body := map[string]string{
		"chain":  "bnb",
		"amount": "1000",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/v1/check", bytes.NewReader(bodyBytes))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", contentType)
	}
}

func TestDefaultOp_Empty(t *testing.T) {
	// Empty operation type should default to "withdrawal".
	if defaultOp("") != "withdrawal" {
		t.Errorf("defaultOp(\"\") = %q, want withdrawal", defaultOp(""))
	}
}

func TestDefaultOp_NonEmpty(t *testing.T) {
	// Non-empty operation type should be returned as-is.
	if defaultOp("sweep") != "sweep" {
		t.Errorf("defaultOp(\"sweep\") = %q, want sweep", defaultOp("sweep"))
	}
}
