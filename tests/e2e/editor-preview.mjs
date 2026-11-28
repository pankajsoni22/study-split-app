// The editor's text side is a true preview of the reader: same margins, text size and line wrapping in each layout.
import { BASE, IDS, barMenu, check, run } from './lib.mjs';

const LAYOUTS = ['70-30', '60-40', '50-50', '40-60', '30-70'];

await run('editor-preview', async ({ page, signIn }) => {
  const p = await page();
  await signIn(p);
  const measure = sel => p.evaluate(sel => {
    const pane = document.querySelector(sel); const pr = pane.getBoundingClientRect();
    const para = [...pane.querySelectorAll('.ProseMirror > p')].find(x => x.getBoundingClientRect().height > 40);
    const r = para.getBoundingClientRect();
    const heights = []; for (const b of pane.querySelectorAll('.ProseMirror > *')) { if (b.tagName === 'H2' && heights.length) break; heights.push(Math.round(b.getBoundingClientRect().height)); }
    return { left: Math.round(r.left - pr.left), right: Math.round(pr.right - r.right), font: getComputedStyle(para).fontSize, heights };
  }, sel);
  for (const layout of ['70-30', '50-50', '40-60']) {
    const i = LAYOUTS.indexOf(layout);
    await p.goto(BASE + '/read/EtlPipeline1#split-1-the-problem'); await p.waitForTimeout(3000);
    await p.locator('.reader-bar .layout-picker [role="radio"]').nth(i).click(); await p.waitForTimeout(600);
    const rd = await measure('.reader-scroll');
    await p.goto(BASE + '/write/' + IDS['telemetry-etl-pipeline']); await p.waitForTimeout(5000);
    await barMenu(p, 'Layout').click(); await p.locator('.menu-panel [role="menuitemradio"]', { hasText: 'Manual' }).click();
    await p.locator('.menu-panel .layout-picker [role="radio"]').nth(i).click(); await p.keyboard.press('Escape'); await p.waitForTimeout(700);
    const ed = await measure('.editor-text');
    check(rd.left === ed.left && rd.right === ed.right && rd.font === ed.font,
      `${layout}: same margins and text size (read ${rd.left}/${rd.right}px ${rd.font}, edit ${ed.left}/${ed.right}px ${ed.font})`);
    check(rd.heights.length > 3 && rd.heights.every((h, j) => h === ed.heights[j]), `${layout}: every block of split 1 wraps identically`);
    await barMenu(p, 'Layout').click(); await p.locator('.menu-panel [role="menuitemradio"]', { hasText: 'Auto' }).click(); await p.keyboard.press('Escape');
  }
});
