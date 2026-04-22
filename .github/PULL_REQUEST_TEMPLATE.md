## Summary

<!-- What does this PR do? (1-3 sentences) -->

## Context

<!-- Why is this change needed? Link to issue, phase spec, or design doc. -->
<!-- Phase reference: plans/YYYYMMDD-HHMM-slug/phase-XX-name.md -->

## Test Plan

- [ ] Unit tests pass: `pnpm -r test`
- [ ] Typecheck passes: `pnpm -r typecheck`
- [ ] Biome check passes: `pnpm exec biome check .`
- [ ] Manually verified locally (describe steps)
- [ ] E2E / integration test (if applicable)

## CI Checklist

- [ ] `lint-typecheck` job green
- [ ] `unit-tests` job green
- [ ] `smoke-e2e` job green (if touching backend/UI)
- [ ] No new biome errors (warnings OK for baseline rules)
- [ ] Bundle size delta checked (if touching UI)

## Risks

<!-- Any breaking changes, migration steps, or rollback concerns? -->
<!-- If none, write "None". -->

## Phase Reference

<!-- Link to the relevant phase file, e.g.: -->
<!-- plans/260420-1748-wallet-portal-mvp-scaffold/phase-11-ci-and-deployment-stubs.md -->
