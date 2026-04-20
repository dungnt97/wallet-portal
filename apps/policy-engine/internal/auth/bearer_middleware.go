// Package auth provides service-to-service authentication middleware.
// Uses shared bearer secret per Decision D4 (mTLS deferred post-MVP).
package auth

import (
	"crypto/subtle"
	"net/http"
	"strings"
)

// BearerMiddleware returns a chi-compatible middleware that enforces the
// shared bearer token on every request.
//
// Security: constant-time comparison prevents timing-based token enumeration.
// The token is never logged.
func BearerMiddleware(token string) func(http.Handler) http.Handler {
	expectedBytes := []byte(token)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			candidate := strings.TrimPrefix(authHeader, "Bearer ")
			if candidate == authHeader || candidate == "" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			// Constant-time compare — always evaluates both sides regardless of match.
			candidateBytes := []byte(candidate)
			if subtle.ConstantTimeCompare(candidateBytes, expectedBytes) != 1 {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
