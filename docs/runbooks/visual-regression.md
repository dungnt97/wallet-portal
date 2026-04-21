# Visual Regression Runbook

**Owner:** @ui-team  
**Reviewed:** 2026-04-21  
**CI workflow:** `.github/workflows/visual-regression.yml`

---

## Overview

Playwright captures full-page screenshots of all 12 admin pages against a pinned Chromium build.
Snapshots are stored in `apps/ui/tests/e2e/__screenshots__/` and committed to git.
The nightly CI job diffs actual renders against those baselines; pixel deltas above the threshold fail the job.

Pages covered: dashboard, deposits, withdrawals, sweep, cold storage, audit log, users, signers, recovery, reconciliation, ops, multisig ceremony.

Projects: `chromium-desktop` (1440×900) and `chromium-mobile` (375×667).

---

## Updating Baselines (Intentional UI Change)

Run locally after the UI change is complete and reviewed:

```bash
# From monorepo root
pnpm -F @wp/ui test:e2e:update
```

This regenerates all PNGs. Then:

1. Review the diffs in git: `git diff --stat apps/ui/tests/e2e/__screenshots__/`
2. Open changed PNGs visually to confirm they look correct.
3. Commit the updated screenshots alongside the UI change:

```bash
git add apps/ui/tests/e2e/__screenshots__/
git commit -m "test(ui): update visual baselines for <describe change>"
```

Only commit baselines that correspond to the intentional change — revert any unexpected diffs before committing.

---

## CI Failure Triage

### Step 1 — Download the failure artifact

On the failed GitHub Actions run:
- Go to **Summary → Artifacts**
- Download `playwright-report-chromium-desktop-<run_id>` or `chromium-mobile` variant
- Open `playwright-report/index.html` in a browser

The HTML report shows:
- **Expected** (baseline PNG)
- **Actual** (what CI rendered)
- **Diff** (red pixels = changed areas)

### Step 2 — Classify the failure

| Symptom | Likely cause | Action |
|---------|-------------|--------|
| Small diff (<50px), same layout | Font hinting / AA variance | Increase `maxDiffPixels` locally, check if reproducible across runs |
| Layout shift in one component | Real UI regression | Investigate the component, fix or update baseline intentionally |
| Full page white / login redirect | `VITE_AUTH_DEV_MODE` not set, or dev-mode bypass path broken | Check `auth-provider.tsx` dev-mode block, `__dev_staff__` localStorage key |
| Timestamp / counter mismatch | `Date.now()` freeze not applied | Check `mock-api.ts` `addInitScript` for the `FakeDate` injection |
| Animation frame visible | CSS transition not disabled | Verify the animation-reset style tag is injected before page paint |
| Blank screenshot | Page crashed or selector timeout | Check the `waitForSelector` fallback in the spec, increase timeout |

### Step 3 — False positive handling (flake)

If the same test passes on re-run without code changes:

1. Check if a third-party font or icon loaded differently (network timing).
2. Add the flaky element to the `mask:` array in the spec.
3. If it persists across 3+ runs, increase `retries` in `playwright.config.ts` to 2 for that spec only.

---

## Running Tests Locally

```bash
# Run all visual tests (Vite dev server auto-starts)
pnpm -F @wp/ui test:e2e

# Run a single spec
pnpm -F @wp/ui test:e2e tests/e2e/visual/visual-dashboard.spec.ts

# Open interactive UI mode
pnpm -F @wp/ui test:e2e:ui

# Update baselines
pnpm -F @wp/ui test:e2e:update
```

The dev server starts automatically via `webServer` in `playwright.config.ts`.
If a server is already running on port 5173, it will be reused (local only; CI always starts fresh).

---

## Adding a New Page

1. Create `apps/ui/tests/e2e/visual/visual-<page-name>.spec.ts` following the pattern in existing specs.
2. Import from `../support/visual-test-base` to get mock API + dev auth wired automatically.
3. Run `pnpm -F @wp/ui test:e2e:update` to capture the initial baseline.
4. Commit both the spec and the PNG baselines together.

---

## Architecture Notes

- **`playwright.config.ts`** — config, projects, webServer, snapshot path template
- **`tests/e2e/support/mock-api.ts`** — intercepts `**/api/**`, `**/wallet/**`, `**/policy/**`; freezes `Date.now()` to `2026-04-21T10:00:00Z`; disables CSS animations
- **`tests/e2e/support/dev-auth-fixture.ts`** — seeds `__dev_staff__` in localStorage; triggers the dev-mode bypass in `AuthProvider`
- **`tests/e2e/support/visual-test-base.ts`** — composes both fixtures into a single `test` export; all specs import from here
- **`src/auth/auth-provider.tsx`** — reads `VITE_AUTH_DEV_MODE` and `__dev_staff__` localStorage to bypass OIDC in test mode
