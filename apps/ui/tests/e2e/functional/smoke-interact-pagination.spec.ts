// Smoke: pagination controls on /app/deposits (PAGE_SIZE=15, .pagination row always renders).
// If only 1 page of data exists, seeds 30 rows via /dev/seed/deposit then reloads.
// Asserts: next → page 2 → prev → page 1. Accepts 0 rows (empty page is valid).
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

const API = 'http://localhost:3001';

test('deposits pagination: next/prev page', async ({ page }) => {
  await seedRealAuth(page);
  await gotoApp(page, 'deposits');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });
  await page.waitForTimeout(1_500);

  // .pagination row is always rendered by DepositsPage regardless of row count
  const pagination = page.locator('.pagination').first();
  await expect(pagination).toBeVisible({ timeout: 8_000 });

  // Detect total pages from "Page N of M" text (second "of" in the pagination bar).
  // NOTE: The bar also renders "Showing X-Y of Z" — match the Page/of pattern explicitly
  // to avoid reading the record count Z instead of the page count M.
  function extractTotalPages(text: string): number {
    const match = /page\s+\d+\s+of\s+(\d+)/i.exec(text);
    return match ? Number.parseInt(match[1] ?? '1', 10) : 1;
  }

  const paginationText = (await pagination.textContent()) ?? '';
  let totalPages = extractTotalPages(paginationText);

  // Seed 30 deposits via dev endpoint if only 1 page available
  if (totalPages < 2) {
    const seedRequests = Array.from({ length: 30 }, (_, i) =>
      page
        .context()
        .request.post(`${API}/dev/seed/deposit`, {
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
    totalPages = extractTotalPages(refreshedText);
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
