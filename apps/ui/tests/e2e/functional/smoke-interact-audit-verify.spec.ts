// Smoke: audit verify-chain + row detail sheet.
// AuditPage auto-runs useAuditVerify for the visible page range — no manual click needed.
// The "Verify chain" button in the page header triggers CSV export guard, not verify.
// Verify runs automatically; results appear as HashBadge (.badge-tight ok / .badge-tight danger)
// in the actions table alongside each row.
// Row click → AuditDetailSheet (.sheet) opens → close via button[aria-label="Close"].
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('audit: verify-chain badges + row detail sheet', async ({ page }) => {
  await seedRealAuth(page);
  await gotoApp(page, 'audit');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Wait for data to load (audit logs may take a moment)
  await page.waitForTimeout(2_000);

  // --- Verify-chain badges appear automatically for loaded rows -----------------
  // useAuditVerify fires once rows + timestamps are available; badges render as
  // .badge-tight.ok (verified) or .badge-tight.danger (broken chain).
  // If no rows exist the badge list is empty — both outcomes acceptable.
  const verifiedBadge = page.locator('.badge-tight.ok, .badge-tight.danger').first();
  const rowCount = await page.locator('tbody tr').count();

  // Real data rows have cursor:pointer and class "hoverable".
  // The empty-state placeholder row has no onClick — filter it out.
  const dataRows = page.locator('tbody tr.hoverable');
  const dataRowCount = await dataRows.count();

  if (dataRowCount > 0) {
    // At least one hash badge should appear after verify resolves (up to 8s for API)
    await expect(verifiedBadge).toBeVisible({ timeout: 8_000 });

    // Assert badge is green (ok) or red (danger) — either is correct behaviour
    const badgeClass = await verifiedBadge.getAttribute('class');
    expect(badgeClass).toMatch(/badge-tight (ok|danger)/);

    // --- Click first data row → AuditDetailSheet opens (.sheet) -----------------
    await dataRows.first().click();

    const sheet = page.locator('.sheet').first();
    await expect(sheet).toBeVisible({ timeout: 6_000 });

    // Detail sheet contains non-trivial text (action label, timestamp, hash info)
    const sheetText = await sheet.textContent();
    expect(sheetText?.length).toBeGreaterThan(10);

    // --- Close sheet via aria-label="Close" button (Sheet component) ------------
    const closeBtn = sheet.locator('button[aria-label="Close"]').first();
    if (await closeBtn.count()) {
      await closeBtn.click();
    } else {
      // Fallback: click the .scrim backdrop
      await page.locator('.scrim').first().click();
    }
    await expect(sheet).not.toBeVisible({ timeout: 5_000 });
  } else {
    // No real data rows: page must still render without crash (empty state)
    await expect(page.locator('.pro-card').first()).toBeVisible({ timeout: 5_000 });
  }

  // --- Export CSV button visible (guarded by total > cap check) -----------------
  const exportBtn = page.locator('button', { hasText: /export/i }).first();
  if (await exportBtn.count()) await expect(exportBtn).toBeVisible({ timeout: 5_000 });
});
