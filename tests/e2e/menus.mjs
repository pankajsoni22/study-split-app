// Top bars: reader (layout picker in the bar, Mode menu, ⋯ Theme) and editor (Layout ▾, Mode ▾, ⋯ View/Theme/Settings),
// and the text toolbar lining up with the drawing's format bar in every layout. Sample: telemetry-etl-pipeline.
import { BASE, IDS, barMenu, check, clickAt, openFresh, pickInMenu, run } from './lib.mjs';

await run('menus', async ({ page, signIn, shot }) => {
  // ---------------- reader ----------------
  const r = await page();
  await openFresh(r, BASE + '/dev-writer/telemetry-etl-pipeline');
  check(await barMenu(r, 'Layout').count() === 0 && await r.locator('.reader-bar .bar-layout .layout-picker [role="radio"]').count() === 5,
    'reader: the layout choices sit directly in the bar');
  check((await r.locator('.reader-bar .layout-picker [aria-checked="true"]').getAttribute('title')).includes('40:60'), 'reader: starts on the writer\'s layout (40:60)');
  await r.locator('.reader-bar .layout-picker [role="radio"]').nth(1).click(); await r.waitForTimeout(400);
  check((await r.locator('.reader-bar .layout-picker [aria-checked="true"]').getAttribute('title')).includes('60:40'), 'reader: picking 60:40 applies it');
  check((await barMenu(r, 'Mode').locator('.bar-menu-value').innerText()) === 'Split · Unfold', 'reader: Mode shows "Split · Unfold"');
  await pickInMenu(r, 'Mode', 'Article');
  check(await r.locator('main.reader-article').count() === 1 && await r.locator('.reader-bar .layout-picker [role="radio"]').first().isDisabled(),
    'reader: Mode → Article; layout greyed out there');
  await pickInMenu(r, 'Mode', 'Split');
  await r.locator('.reader-bar button[aria-label="Settings"]').click();
  await r.locator('.menu-panel [aria-label="Theme"] button[title="Dark"]').click(); await r.waitForTimeout(300);
  check(await r.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'reader: ⋯ → Theme → Dark');
  await r.locator('.menu-panel [aria-label="Theme"] button[title="System"]').click(); await r.keyboard.press('Escape');
  await shot(r, 'reader-bar', { x: 0, y: 0, width: 1440, height: 60 });
  const m = await page({ width: 390, height: 800 });
  await m.goto(BASE + '/dev-writer/telemetry-etl-pipeline'); await m.waitForTimeout(3000);
  check(await m.locator('.reader-bar button[aria-label="Settings"]').isVisible() && await m.evaluate(() => document.documentElement.scrollWidth <= 390),
    'phone: ⋯ Settings reachable, no sideways scroll');

  // ---------------- editor ----------------
  const e = await page();
  await signIn(e);
  await e.goto(BASE + '/write/' + IDS['telemetry-etl-pipeline']); await e.waitForTimeout(6000);
  check(['Auto', 'Unfold'].join() === [await barMenu(e, 'Layout').locator('.bar-menu-value').innerText(), await barMenu(e, 'Mode').locator('.bar-menu-value').innerText()].join(),
    'editor: Layout "Auto", Mode "Unfold"');
  check(await e.locator('.editor-bar > a', { hasText: 'View' }).count() === 0, 'editor: no separate View button');
  await e.locator('.editor-bar button[aria-label^="More"]').click(); await e.waitForTimeout(300);
  const more = await e.locator('.menu-panel').innerText();
  check(more.includes('View article') && more.includes('Theme') && more.includes('Article settings'), 'editor ⋯: View article, Theme, Article settings');
  await e.keyboard.press('Escape');
  check(!(await e.content()).toLowerCase().includes('experimental'), 'no "experimental" label anywhere');

  const bars = () => e.evaluate(() => {
    const b = el => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
    return { text: b(document.querySelector('.editor-text .toolbar')), draw: b(document.querySelector('.canvas-zone .format-bar')) };
  });
  await pickInMenu(e, 'Layout', 'Manual');
  let worst = 0;
  for (let i = 0; i < 5; i++) {
    await barMenu(e, 'Layout').click(); await e.locator('.menu-panel .layout-picker [role="radio"]').nth(i).click(); await e.keyboard.press('Escape'); await e.waitForTimeout(500);
    await clickAt(e, e.locator('.canvas-host'), 0.5, 0.45); await e.waitForTimeout(400);   // a shape → the full format bar
    const b = await bars();
    worst = Math.max(worst, Math.abs(b.text.h - b.draw.h), Math.abs(b.text.top - b.draw.top));
  }
  check(worst < 0.5, `text toolbar and drawing format bar: same height and top in all 5 layouts (worst ${worst}px)`);
  const fits = await e.evaluate(() => { const t = document.querySelector('.toolbar'); return t.scrollWidth <= t.clientWidth; });
  check(fits, 'narrowest layout: the whole text toolbar fits');
  await e.locator('.prose-edit p').first().click();
  await clickAt(e, e.locator('.toolbar .tb-insert')); await e.waitForTimeout(300);
  const insertOk = await e.evaluate(() => { const p = document.querySelector('.toolbar .menu-panel'); if (!p) return false; const r = p.getBoundingClientRect(); return r.height > 150 && p.contains(document.elementFromPoint(r.left + r.width / 2, r.bottom - 12)); });
  check(insertOk, 'Insert menu opens fully (not clipped by the toolbar)');
  await e.keyboard.press('Escape');
  const cell = e.locator('.prose-edit td').first();
  if (await cell.count()) {
    await cell.scrollIntoViewIfNeeded(); await cell.click(); await e.waitForTimeout(400);
    const b = await bars();
    check(Math.abs(b.text.h - b.draw.h) < 0.5, `cursor in a table (extra buttons): bars still equal (${b.text.h}px)`);
  }
  await pickInMenu(e, 'Layout', 'Auto');
  await pickInMenu(e, 'Mode', 'Standard');
  check(await e.locator('.prose-edit .unfold-has').count() === 0, 'editor: Mode → Standard hides the step badges');
  await pickInMenu(e, 'Mode', 'Unfold');
  check(await e.locator('.prose-edit .unfold-has').count() > 0, 'editor: Mode → Unfold shows them again');
});
