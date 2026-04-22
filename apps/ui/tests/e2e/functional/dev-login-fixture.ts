// Dev-login fixture for smoke tests — seeds __dev_staff__ + real session cookie.
// Re-exports from real-api-fixture for a consistent import in smoke specs.
export { test, expect, gotoApp, seedRealAuth, DEV_ADMIN } from '../support/real-api-fixture';
