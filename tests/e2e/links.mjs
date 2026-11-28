// Article links (2026-11-28): /read/{short id} and /write/{short id}; an optional slug as a second link
// (/read/{slug}), unique across the site; old /{username}/{slug} links no longer work.
import { BASE, IDS, check, run } from './lib.mjs';

const SLUG = 'e2e-hashing-test';

await run('links', async ({ page, signIn, shot }) => {
  const e = await page();
  await signIn(e);

  // Cards link by id
  await e.goto(BASE + '/me/articles'); await e.waitForTimeout(2500);
  const hrefs = (await e.locator('a[href*="/write/"]').evaluateAll(as => as.map(a => a.getAttribute('href')))).filter(h => !h.endsWith('/write/new'));
  check(hrefs.length > 0 && hrefs.every(h => /\/write\/[A-Za-z0-9]{12}$/.test(h)), `My articles link to /write/{12-character id} (${hrefs[0]})`);

  // Editor by id; Article settings shows the permanent link and an empty, optional slug
  await e.goto(BASE + '/write/' + IDS['consistent-hashing']); await e.waitForTimeout(5000);
  check(await e.locator('.editor-crumbs .crumb-split').count() === 1, 'the editor opens at /write/{id}');
  await e.locator('.editor-bar button[aria-label^="More"]').click();
  await e.locator('.menu-panel .menu-item', { hasText: 'Article settings' }).click(); await e.waitForTimeout(400);
  const link = await e.locator('.article-link').innerText();
  check(link.endsWith('/read/' + IDS['consistent-hashing']), `Article settings shows the permanent link (${link.replace(/^https?:\/\/[^/]+/, '')})`);
  check((await e.locator('#slug').inputValue()) === '', 'the slug starts empty (no automatic slug)');
  await shot(e, 'settings');

  // Set a slug, save, open it by slug
  await e.locator('#slug').fill(SLUG); await e.locator('#slug').blur();
  await e.keyboard.press('Escape'); await e.waitForTimeout(300);
  await e.keyboard.press('Control+s'); await e.waitForTimeout(2500);
  check(/saved/i.test(await e.locator('.bar-meta').innerText()), 'saving with a slug works');
  const r = await page();
  await r.goto(BASE + '/read/' + SLUG); await r.waitForTimeout(3500);
  check((await r.locator('.reader-bar-title').innerText()) === 'Consistent Hashing', `/read/${SLUG} opens the article (it is published)`);
  await r.goto(BASE + '/read/' + IDS['consistent-hashing']); await r.waitForTimeout(3500);
  check((await r.locator('.reader-bar-title').innerText()) === 'Consistent Hashing', '/read/{id} opens it too');

  // The same slug on another article is refused
  const other = await page();
  await signIn(other);
  await other.goto(BASE + '/write/' + IDS['telemetry-etl-pipeline']); await other.waitForTimeout(5000);
  await other.locator('.editor-bar button[aria-label^="More"]').click();
  await other.locator('.menu-panel .menu-item', { hasText: 'Article settings' }).click(); await other.waitForTimeout(400);
  await other.locator('#slug').fill(SLUG); await other.locator('#slug').blur();
  await other.keyboard.press('Escape'); await other.waitForTimeout(300);
  await other.keyboard.press('Control+s'); await other.waitForTimeout(2500);
  const msg = await other.locator('body').innerText();
  check(/already used by another article/i.test(msg), 'the same slug on a second article is refused ("already used by another article")');

  // Old-style and unknown links
  await r.goto(BASE + '/dev-writer/consistent-hashing'); await r.waitForTimeout(2500);
  check(await r.locator('.reader-bar-title').count() === 0, 'old /username/slug links no longer open articles');
  await r.goto(BASE + '/read/NoSuchArtic1'); await r.waitForTimeout(3000);
  check(/Article not found/.test(await r.locator('body').innerText()), 'an unknown id shows "Article not found"');
  await e.goto(BASE + '/write/NoSuchArtic1'); await e.waitForTimeout(3000);
  check(/Article not found/.test(await e.locator('body').innerText()), 'the editor with an unknown id shows "Article not found"');
});
