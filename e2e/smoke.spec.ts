import { test, expect } from '@playwright/test';

test('loads the welcome draft and updates its live preview', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle(/Meowhook/);

  const previewPanel = page.locator('#previewPanel');
  await expect(previewPanel).toBeVisible();
  await expect(previewPanel.getByText('Welcome to Meowhook!', { exact: true })).toBeVisible();

  const contentInput = page.getByPlaceholder('Write your message…', { exact: true });
  await expect(contentInput).toBeVisible();
  await expect(contentInput).toHaveValue(/Welcome to Meowhook!/);
  await contentInput.fill('Hello from Playwright!');

  await expect(previewPanel.getByText('Welcome to Meowhook!', { exact: true })).not.toBeVisible();
  await expect(previewPanel.getByText('Hello from Playwright!', { exact: true })).toBeVisible();
});
