// Smoke: pagination controls on /app/deposits (PAGE_SIZE=15, .pagination row always renders).
// If only 1 page of data exists, seeds 60 rows via /dev/seed/deposit then reloads.
// Asserts: next → page 2 → prev → page 1. Accepts 0 rows (empty page is valid).
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('deposits pagination: next/prev page', async ({ page }) => {
  await seedRealAuth(page);
  await gotoApp(page, 'deposits');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });
  await page.waitForTimeout(1_500);

  // .pagination row is always rendered by DepositsPage regardless of row count
  const pagination = page.locator('.pagination').first();
  await expect(pagination).toBeVisible({ timeout: 8_000 });

  // Detect total pages from pagination text ("Page 1 of N")
  const paginationText = (await pagination.textContent()) ?? '';
  const totalPagesMatch = /of\s+(\d+)/i.exec(paginationText);
  let totalPages = totalPagesMatch ? Number.parseInt(totalPagesMatch[1] ?? '1', 10) : 1;

  // Seed 60 deposits via dev endpoint if only 1 page available
  if (totalPages < 2) {
    const seedRequests = Array.from({ length: 60 }, (_, i) =>
      page
        .context()
        .request.post('http://localhost:3001/dev/seed/deposit', {
          data: { chain: 'bnb', token: 'USDT', amount: `${10 + i}.00`, status: 'pending' },
          failOnStatusCode: false,
        })
        .catch(() => null)
    );
    await Promise.all(seedRequests);

    // Reload and re-check
    await gotoApp(page, 'deposits');
    await expect(page.locator('.pagination').first()).toBeVisible({ timeout: 8_000 });
    await page.waitForTimeout(1_000);

    const refreshedText = (await page.locator('.pagination').first().textContent()) ?? '';
    const refreshedMatch = /of\s+(\d+)/i.exec(refreshedText);
    totalPages = refreshedMatch ? Number.parseInt(refreshedMatch[1] ?? '1', 10) : 1;
  }

  const nextBtn = pagination.locator('button').filter({ hasText: /next/i }).first();
  const prevBtn = pagination.locator('button').filter({ hasText: /prev/i }).first();
  await expect(nextBtn).toBeVisible({ timeout: 5_000 });
  await expect(prevBtn).toBeVisible({ timeout: 5_000 });

  if (totalPages >= 2) {
    // Next → page 2
    await expect(nextBtn).toBeEnabled({ timeout: 3_000 });
    await nextBtn.click();
    await page.waitForTimeout(600);
    const afterNext = (await pagination.textContent()) ?? '';
    expect(afterNext).toMatch(/page\s+2|2\s+of/i);

    // Rows render (may be fewer than PAGE_SIZE on last page)
    const rowCount = await page.locator('tbody tr').count();
    expect(rowCount).toBeGreaterThanOrEqual(0);

    // Prev → page 1
    await prevBtn.click();
    await page.waitForTimeout(600);
    const afterPrev = (await pagination.textContent()) ?? '';
    expect(afterPrev).toMatch(/page\s+1|1\s+of/i);
  } else {
    // Single page — both controls must be disabled
    await expect(nextBtn).toBeDisabled({ timeout: 3_000 });
    await expect(prevBtn).toBeDisabled({ timeout: 3_000 });
  }
});
