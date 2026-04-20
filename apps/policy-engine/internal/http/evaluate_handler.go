package http

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/rs/zerolog/log"
	"github.com/wallet-portal/policy-engine/internal/rules"
	"github.com/wallet-portal/policy-engine/internal/service"
)

// evaluateRequestBody is the JSON body accepted by POST /v1/check and POST /evaluate.
type evaluateRequestBody struct {
	OperationType string `json:"operation_type"`
	ActorStaffID  string `json:"actor_staff_id"`
	DestinationAddr string `json:"destination_addr"`
	Amount        string `json:"amount"`
	Chain         string `json:"chain"`
	Tier          string `json:"tier"`
	SignerAddress  string `json:"signer_address"`
	WithdrawalID  string `json:"withdrawal_id"`
}

// EvaluateHandler constructs an http.HandlerFunc for the policy evaluation endpoint.
// It validates the incoming request, delegates to the Evaluator, and returns the result.
func EvaluateHandler(eval *service.Evaluator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body evaluateRequestBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"error":"invalid JSON body"}`, http.StatusBadRequest)
			return
		}

		// Input validation — required fields.
		var missing []string
		if body.Chain == "" { missing = append(missing, "chain") }
		if body.Amount == "" { missing = append(missing, "amount") }
		if len(missing) > 0 {
			http.Error(w,
				`{"error":"missing required fields: `+strings.Join(missing, ", ")+`"}`,
				http.StatusUnprocessableEntity)
			return
		}

		req := rules.EvaluateRequest{
			OperationType:   defaultOp(body.OperationType),
			ActorStaffID:    body.ActorStaffID,
			DestinationAddr: body.DestinationAddr,
			Amount:          body.Amount,
			Chain:           body.Chain,
			Tier:            body.Tier,
			SignerAddress:   body.SignerAddress,
			WithdrawalID:    body.WithdrawalID,
		}

		result := eval.Evaluate(r.Context(), req)

		log.Ctx(r.Context()).Info().
			Str("chain", req.Chain).
			Str("tier", req.Tier).
			Str("operation_type", req.OperationType).
			Bool("allow", result.Allow).
			Strs("reasons", result.Reasons).
			Msg("policy evaluation complete")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(result)
	}
}

// defaultOp returns "withdrawal" when operation_type is omitted, matching the spec default.
func defaultOp(op string) string {
	if op == "" {
		return "withdrawal"
	}
	return op
}
