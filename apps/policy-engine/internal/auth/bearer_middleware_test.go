package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBearerMiddleware_ValidToken(t *testing.T) {
	// Request with correct Authorization header should pass through.
	token := "my_secret_token"
	middleware := BearerMiddleware(token)

	handlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	handler := middleware(nextHandler)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer my_secret_token")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if !handlerCalled {
		t.Errorf("handler was not called for valid token")
	}
	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestBearerMiddleware_MissingAuthorizationHeader(t *testing.T) {
	// Request without Authorization header should be denied.
	token := "my_secret_token"
	middleware := BearerMiddleware(token)

	handlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware(nextHandler)
	req := httptest.NewRequest("GET", "/", nil)
	// no Authorization header
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if handlerCalled {
		t.Errorf("handler should not be called when Authorization header is missing")
	}
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestBearerMiddleware_WrongToken(t *testing.T) {
	// Request with wrong token should be denied.
	token := "correct_token"
	middleware := BearerMiddleware(token)

	handlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware(nextHandler)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer wrong_token")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if handlerCalled {
		t.Errorf("handler should not be called for wrong token")
	}
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestBearerMiddleware_MalformedAuthHeader_NoBearer(t *testing.T) {
	// Authorization header without "Bearer " prefix should be denied.
	token := "my_secret_token"
	middleware := BearerMiddleware(token)

	handlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware(nextHandler)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "my_secret_token") // missing "Bearer " prefix
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if handlerCalled {
		t.Errorf("handler should not be called for malformed header")
	}
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestBearerMiddleware_EmptyToken(t *testing.T) {
	// Authorization header "Bearer " with empty token should be denied.
	token := "my_secret_token"
	middleware := BearerMiddleware(token)

	handlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware(nextHandler)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer ") // empty token
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if handlerCalled {
		t.Errorf("handler should not be called for empty token")
	}
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestBearerMiddleware_CaseSensitiveToken(t *testing.T) {
	// Token comparison should be case-sensitive (exact match required).
	token := "MySecretToken"
	middleware := BearerMiddleware(token)

	handlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware(nextHandler)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer mysecrettoken") // wrong case
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if handlerCalled {
		t.Errorf("token comparison should be case-sensitive")
	}
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestBearerMiddleware_ExtraWhitespace(t *testing.T) {
	// Token with extra whitespace should not match (exact comparison).
	token := "my_secret_token"
	middleware := BearerMiddleware(token)

	handlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware(nextHandler)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer my_secret_token ") // trailing space
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if handlerCalled {
		t.Errorf("extra whitespace should not match")
	}
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}
