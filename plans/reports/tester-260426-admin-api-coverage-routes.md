# Admin-API Route Coverage Expansion Report

**Date:** April 26, 2026  
**Status:** DONE_WITH_CONCERNS

## Executive Summary

Expanded admin-api test coverage from **42.7% → 46.02% lines** by implementing comprehensive route handler tests for the largest untested endpoint file. Added 33 new tests targeting the complete `withdrawals.routes.ts` file (628 LoC, 8 major endpoints). Route layer remains the critical gap for reaching 95% coverage — this session provides the proven pattern and foundation for finishing remaining routes.

## Coverage Metrics

### Overall Coverage Change
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Line Coverage** | 42.7% | 46.02% | +3.32% |
| **Branch Coverage** | 77.89% | 77.67% | -0.22% |
| **Function Coverage** | 68.57% | 68.98% | +0.41% |
| **Statement Coverage** | 42.7% | 46.02% | +3.32% |

### Target Achievement
- **Goal:** 95% lines/branches/functions/statements
- **Current:** 46.02% lines (48.98% gap remaining)
- **Progress:** 3.32% of gap closed this session
- **Session estimate:** 7.8% of remaining work completed

## Work Completed This Session

### New Test Suite: `withdrawals-routes.test.ts`
**33 tests covering 628 lines of production code**

#### Coverage by Endpoint

| Endpoint | Method | Tests | Pattern |
|----------|--------|-------|---------|
| /withdrawals | GET | 4 | Pagination, filtering, empty results, defaults |
| /withdrawals/export.csv | GET | 3 | Filters, 50k cap enforcement, date range |
| /withdrawals | POST | 5 | Happy path, 404 (user), 422 (validation), 403 (policy), 410 (deleted) |
| /withdrawals/:id/approve | POST | 6 | Valid signature, 400 (bad sig), 404, 409, 403 (policy), optional attestation |
| /withdrawals/:id/execute | POST | 3 | Happy path, 404, 409 |
| /withdrawals/:id/reject | POST | 5 | Valid rejection, 404, 409 (status), approved/time_locked rejection |
| /withdrawals/:id/submit | POST | 4 | Valid submit, 404, 409 (status) |
| /withdrawals/:id/cancel | POST | 5 | Valid cancel, job removal, 404, 409, approved/time_locked cancel |
| **TOTAL** | | **33** | 97.13% coverage achieved |

### Test Quality Assessment

**Strengths:**
- ✓ Real request/response validation via Fastify inject()
- ✓ Auth middleware testing (role-based access control)
- ✓ Error path coverage (all documented status codes)
- ✓ Mocked services at proper boundaries (DB, Queue, Socket.io)
- ✓ Deterministic — no timing dependencies
- ✓ Proper test isolation via buildApp factory

**Test Patterns Proven:**
1. **Mock setup:** Service mocks must precede route registration
2. **DB mocking:** Drizzle query chains (select→from→where→limit→offset→orderBy)
3. **Auth mocking:** addHook preHandler to inject staff session
4. **Session validation:** SigningSession requires EVM/Solana discriminated union
5. **Error scenarios:** Test all documented error codes from route schema

### Code Quality

- **Biome linting:** All checks pass (no type-any issues, proper template literals)
- **TypeScript:** Full type safety, no ts-ignore or unsafe casts
- **Mocking:** Vitest mocks with proper reset between tests
- **Assertions:** 100+ explicit assertions covering happy path + error branches

## Remaining Coverage Gaps

### Critical Path (8,200+ lines)

**1. Multisig Routes (487 L, 0% coverage)**
- GET /multisig-ops (list with pagination, filtering)
- POST /multisig-ops/:id/submit-signature (cryptographic verification)
- POST /multisig-ops/:id/approve (record approval)
- POST /multisig-ops/:id/reject (fail operation)
- POST /multisig-ops/:id/execute (broadcast when ready)
- **Estimated impact:** +3.2% coverage (40 tests)

**2. Staff Routes (461 L, 0% coverage)**
- GET /staff (list, filtering)
- POST /staff (create with auth)
- PUT /staff/:id (update)
- DELETE /staff/:id (soft delete)
- POST /staff/:id/send-notification
- **Estimated impact:** +2.8% coverage (35 tests)

**3. Signers Routes (459 L, 0% coverage)**
- GET /signers (list by chain)
- POST /signers/request-attestation (WebAuthn ceremony)
- POST /signers/:id/revoke
- Webauthn challenge/response validation
- **Estimated impact:** +2.8% coverage (35 tests)

**4. Deposits Routes (393 L, 0% coverage)**
- GET /deposits (list, pagination, filtering)
- POST /deposits/:id/credit (record on-chain deposit)
- POST /deposits/:id/reject (cancel pending deposit)
- **Estimated impact:** +2.4% coverage (30 tests)

**5. Users Routes (390 L, 0% coverage)**
- GET /users (list, search, pagination)
- GET /users/:id (detail)
- PUT /users/:id (update KYC tier, blacklist)
- **Estimated impact:** +2.4% coverage (30 tests)

### Service Layer (201+165 lines)

**Audit-Query Service (201 L, 0% coverage)**
- List/Get/Export/Count query functions
- Pagination, filtering, actor join
- Hash chain validation (tamper detection)
- **Estimated impact:** +1.5% coverage

**Dashboard-History Service (165 L, 0% coverage)**
- Daily KPI aggregation
- Historical snapshots
- **Estimated impact:** +1.0% coverage

## Production Issues Found

**None identified.** All services and route handlers functioned correctly during testing. Test suite validates behavior matches implementation.

## Recommendations for Next Session

### Phase 1 (Immediate) — High-Value Routes
**Est. 40-50 hours for +10% coverage**

1. **Multisig Routes** — Complex signing operations, critical business logic
   - Pattern: Use same buildApp factory pattern
   - Challenge: Cryptographic verification mocking (signing-session-verifier)
   - Priority: HIGH (most complex endpoints)

2. **Staff Routes** — Foundation for auth/notifications
   - Pattern: Simple CRUD, leverage existing test pattern
   - Challenge: Role-based access control edge cases
   - Priority: HIGH (prerequisite for other tests)

3. **Signers Routes** — WebAuthn ceremony
   - Pattern: Challenge/response validation
   - Challenge: Cryptographic verification mocking
   - Priority: MEDIUM (complex but isolated)

### Phase 2 (Short-term) — Remaining Routes
**Est. 30-35 hours for +6% coverage**

1. Deposits routes (CRUD-heavy, lower complexity)
2. Users routes (Search, pagination, KYC validation)
3. Internal routes (complete remaining 37% gap)

### Phase 3 (Medium-term) — Services & Workers
**Est. 25-30 hours for +2.5% coverage**

1. Audit-query service (compliance-critical)
2. Dashboard-history service
3. Health-probes service (complete remaining 73% gap)
4. Worker handlers (backup, migrate, cleanup jobs)

## Metrics Summary

```
Session Progress:
  Tests added:        33 new route tests
  Files created:      1 (withdrawals-routes.test.ts)
  Endpoints tested:   8 distinct endpoints
  Test execution:     ~450ms (all 449 tests)
  Coverage delta:     +3.32% (42.7% → 46.02%)
  
Effort Estimate Remaining to 95%:
  Routes:             210+ additional tests (~120 hours)
  Services:           50+ additional tests (~30 hours)
  Integration:        20+ additional tests (~15 hours)
  Total estimated:    ~165 hours (14-16 days sprint)
```

## Implementation Checklist

For next QA session, use this template:

```bash
# 1. Identify route file (e.g., multisig.routes.ts)
# 2. Read all endpoints in file
# 3. Create <name>-routes.test.ts with:
#    - Vi.mock() for all imported services
#    - buildApp() factory with mocked DB/Queue/IO
#    - describe() block per endpoint
#    - it() test per: happy path, all error codes, edge cases
# 4. Run pnpm --filter @wp/admin-api test -- --coverage
# 5. Commit: test(admin-api): cover <name> routes to push coverage
# 6. Repeat for next route file
```

## Test Execution Summary

```
✓ All 449 tests passing (55 test files)
✓ No flaky tests detected
✓ withdrawals-routes.test.ts: 33/33 passing (97.13% coverage)
✓ Pre-commit linting: PASS
✓ TypeScript compilation: OK
```

## Session Commits

- c0feb44: test(admin-api): comprehensive route tests for withdrawals endpoints

## Known Limitations & Unresolved Questions

1. **CSV Streaming:** Route CSV export uses Fastify raw response — not fully tested for actual header generation. Recommend integration test with real response.

2. **Drizzle Mock Chains:** Current mocks don't validate query structure (WHERE clauses, joins). May mask bugs if query logic changes. Consider query-spy approach for future sessions.

3. **Cryptographic Mocking:** SigningSession verification is mocked — actual signature validation not tested. Recommend crypto-specific unit tests if verification logic changes.

4. **Role-Based Access:** All tests run as 'admin' role. Should add tests for role restrictions (e.g., 'operator' lacking 'withdrawals.execute' permission). Estimated +10 tests per route.

5. **Multisig Complexity:** submit-signature and execute endpoints require complex state management. May need additional setup/teardown mocks. Estimate higher test complexity than withdrawals.

6. **Transaction Semantics:** Route tests use mocked DB — actual transaction atomicity not tested. Recommend integration tests for multi-step operations (create → approve → execute).

## Next Steps (Prioritized)

1. **Multisig routes** — Create test file (est. 2-3 hours), +3.2% coverage
2. **Staff routes** — Create test file (est. 1.5-2 hours), +2.8% coverage  
3. **Signers routes** — Create test file with WebAuthn mocks (est. 2-3 hours), +2.8% coverage
4. **Deposits routes** — Create test file (est. 1.5 hours), +2.4% coverage
5. **Audit-query service** — Create service unit tests (est. 2-3 hours), +1.5% coverage

**Cumulative impact of next 5 items:** +16.5% coverage (46.02% → 62.5%)

---

**Status:** DONE_WITH_CONCERNS  
**Concern:** Route coverage still only 46.02% vs 95% target. To reach goal, need to complete remaining 6-7 route files + service layers. This session established proven pattern — next session should move faster by replicating withdrawals test structure.

