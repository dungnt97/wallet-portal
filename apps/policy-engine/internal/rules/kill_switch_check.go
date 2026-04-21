package rules

import (
	"context"
	"sync"
	"time"

	"github.com/wallet-portal/policy-engine/internal/db"
)

// killSwitchCacheTTL is the maximum age of the cached kill-switch flag before
// a fresh DB query is issued. 5 seconds balances staleness vs. DB load.
const killSwitchCacheTTL = 5 * time.Second

// KillSwitchCheck denies withdrawal and sweep operations when the global
// kill-switch flag is enabled. The flag is cached in-process for up to 5s to
// avoid hammering the DB on every policy check.
//
// Thread-safe: mu protects cachedEnabled + cacheAt.
type KillSwitchCheck struct {
	mu            sync.Mutex
	cachedEnabled bool
	cacheAt       time.Time
}

func (k *KillSwitchCheck) Name() string { return "kill_switch_check" }

// AppliesTo returns true only for outbound operations (withdrawal or sweep).
// Deposits and reads are never blocked by the kill-switch.
func (k *KillSwitchCheck) AppliesTo(req EvaluateRequest) bool {
	return req.OperationType == "withdrawal" || req.OperationType == "sweep"
}

// Check reads the kill-switch flag (cached for 5s) and denies the request when enabled.
func (k *KillSwitchCheck) Check(ctx context.Context, _ EvaluateRequest, q db.Querier) (bool, string, error) {
	enabled, err := k.flagEnabled(ctx, q)
	if err != nil {
		// DB error — fail closed: deny the operation to be safe.
		return false, "kill_switch_check: DB error reading flag — failing closed", err
	}
	if enabled {
		return false, "KILL_SWITCH_ENABLED", nil
	}
	return true, "", nil
}

// flagEnabled returns the cached flag value, refreshing from DB when the cache
// is expired or has never been populated.
func (k *KillSwitchCheck) flagEnabled(ctx context.Context, q db.Querier) (bool, error) {
	k.mu.Lock()
	defer k.mu.Unlock()

	if time.Since(k.cacheAt) < killSwitchCacheTTL {
		return k.cachedEnabled, nil
	}

	enabled, err := q.GetKillSwitchEnabled(ctx)
	if err != nil {
		return false, err
	}

	k.cachedEnabled = enabled
	k.cacheAt = time.Now()
	return enabled, nil
}
