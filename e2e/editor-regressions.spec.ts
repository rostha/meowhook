import { test, expect, type Page } from '@playwright/test';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2foAAAAASUVORK5CYII=', 'base64');

async function openDraft(page: Page, onlyContainer = false) {
  await page.route('https://example.com/**', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.addInitScript(({ onlyContainer }) => {
    if (localStorage.getItem('meowhook_tabs')) return;
    const container = { id: 'container', type: 'container', color: 0xa9b9b4, blocks: [{ id: 'text', type: 'text', content: 'Nested text' }] };
    const section = { id: 'section', type: 'section', content: 'Section text', url: 'https://example.com/thumb.png', description: 'Thumbnail alt',
      button: { id: 'button', label: 'Saved link', url: 'https://example.com', emoji: '🐈', disabled: true } };
    const message = { id: 'message', content: 'Regular text', username: 'Meowhook', avatar_url: 'https://example.com/avatar.png', tts: false, embeds: [],
      flags: 32768, componentMode: 'v2', componentBlocks: onlyContainer ? [container] : [section, container],
      _attachments: [{ fieldKey: 'avatar', previewUrl: 'https://example.com/avatar.png', name: 'avatar.png', size: 1024, mimeType: 'image/png' }] };
    localStorage.setItem('meowhook_tabs', JSON.stringify([{ id: 'draft', name: 'Regression draft', messages: [message], webhookUrl: '' }]));
  }, { onlyContainer });
  await page.goto('/');
  await expect(page.locator('[data-component-block-id="container"]')).toBeVisible();
}

for (const width of [1600, 390]) {
  test(`removing the last container returns focus at ${width}px`, async ({ page }) => {
    await openDraft(page, true);
    await page.setViewportSize({ width, height: 1200 });
    if (width < 1200) await page.getByRole('tab', { name: 'Editor', exact: true }).click();
    const remove = page.getByRole('button', { name: 'Remove container', exact: true });
    await remove.focus();
    await remove.press('Enter');
    await expect(page.locator('[data-component-block-id="container"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Add component', exact: true })).toBeFocused();
  });
}

test('accessory settings, thumbnail files and avatar filenames survive cleanup and reload', async ({ page }) => {
  await openDraft(page);
  const section = page.locator('[data-component-block-id="section"]');
  await section.getByLabel('Upload Thumbnail URL', { exact: true }).setInputFiles({ name: 'saved-thumb.png', mimeType: 'image/png', buffer: png });
  await section.getByRole('button', { name: 'Link button', exact: true }).click();
  await expect(section.getByRole('textbox', { name: 'Link 1 label', exact: true })).toHaveValue('Saved link');
  await page.locator('.message-v2-toggle input').uncheck();
  await page.getByRole('button', { name: 'Add embed', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('meowhook_tabs')!)[0].messages[0].embeds.length)).toBe(1);
  await page.reload();
  await page.locator('.message-v2-toggle input').check();
  await section.getByRole('button', { name: 'Thumbnail', exact: true }).click();
  await expect(section.locator('.media-source__file-info')).toContainText('saved-thumb.png');
  await expect.poll(() => section.locator('.media-source__preview img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('meowhook_tabs')!)[0].messages[0].componentBlocks[0].accessory)).toBe('thumbnail');
  await page.reload();
  await section.getByRole('button', { name: 'Link button', exact: true }).click();
  await expect(section.getByRole('textbox', { name: 'Link 1 label', exact: true })).toHaveValue('Saved link');
  await section.getByText('Button options', { exact: true }).click();
  await expect(section.getByRole('textbox', { name: 'Link 1 emoji', exact: true })).toHaveValue('🐈');
  await expect(section.getByRole('checkbox', { name: 'Link 1 disabled', exact: true })).toBeChecked();
  await page.getByRole('button', { name: /^Name & avatar/ }).click();
  await expect(page.locator('[data-message-section="profile"] .media-source__file-info')).toContainText('avatar.png');
});

test('regular sending excludes saved V2 uploads', async ({ page }) => {
  await page.route('https://discord.com/api/webhooks/**', route => route.fulfill({ json: route.request().method() === 'GET'
    ? { id: '123456789012345678', name: 'Test webhook', avatar: null }
    : { id: '987654321098765432', content: 'Regular text', embeds: [], attachments: [] } }));
  await openDraft(page);
  await page.getByLabel('Upload Thumbnail URL', { exact: true }).setInputFiles({ name: 'dormant.png', mimeType: 'image/png', buffer: png });
  await page.locator('.message-v2-toggle input').uncheck();
  await page.getByRole('textbox', { name: 'Discord webhook URL', exact: true }).fill('https://discord.com/api/webhooks/123456789012345678/test-token');
  const sent = page.waitForRequest(request => request.url().includes('/api/webhooks/') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const request = await sent;
  expect(request.headers()['content-type']).toContain('application/json');
  expect(request.postDataJSON()).toMatchObject({ content: 'Regular text' });
  expect(request.postDataJSON()).not.toHaveProperty('attachments');
  expect(request.postDataJSON()).not.toHaveProperty('components');
});
