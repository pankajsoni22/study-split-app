// Editor navigation (same as the reader): breadcrumb + Contents, sub-section jumps with a flash, the drawing following
// the split in view, drawing moving the cursor there, full-screen Splits sidebar, split panel hover preview + click.
import { BASE, IDS, check, clickAt, run } from './lib.mjs';

await run('editor-nav', async ({ page, signIn, shot }) => {
  const e = await page();
  await signIn(e);
  const crumb = () => e.locator('.editor-crumbs .crumb-title').innerText();
  const drawingSplit = async () => { const t = await e.locator('.slide-pane button', { hasText: 'Splits' }).first().innerText(); return Number(/(\d+)\s*\//.exec(t)?.[1] ?? 0); };
  const topOf = (text, tag = 'h2') => e.evaluate(([text, tag]) => {
    const sc = document.querySelector('.editor-scroll').getBoundingClientRect().top;
    const h = [...document.querySelectorAll(`.prose-edit > ${tag}`)].find(x => x.textContent.trim().startsWith(text));
    return h ? Math.round(h.getBoundingClientRect().top - sc) : null;
  }, [text, tag]);
  const scrollTo = text => e.locator('.editor-scroll').evaluate((el, text) => {
    const h = [...el.querySelectorAll('.prose-edit > h2')].find(x => x.textContent.startsWith(text));
    el.scrollTop += h.getBoundingClientRect().top - el.getBoundingClientRect().top - 10;
  }, text);
  const cursorSplit = () => e.evaluate(() => { let n = document.querySelector('.prose-edit .unfold-target'); while (n && n.tagName !== 'H2') n = n.previousElementSibling; return n ? n.textContent.replace(/Split \d+$/, '').trim() : null; });
  const atTop = top => top !== null && top >= 0 && top < 40;

  await e.goto(BASE + '/write/' + IDS['telemetry-etl-pipeline']); await e.waitForTimeout(6000);
  check((await crumb()) === 'The problem', 'editor bar shows the reader\'s breadcrumb (split 1)');
  await e.locator('.editor-crumbs .crumb-split').click(); await e.waitForTimeout(300);
  await e.locator('.menu-panel .contents-split', { hasText: 'Parser workers' }).click(); await e.waitForTimeout(1200);
  check(atTop(await topOf('Parser workers')), 'Contents → a split: its heading comes to the top of the text');
  check((await crumb()) === 'Parser workers' && await drawingSplit() === 5, 'breadcrumb and drawing switch to it');

  await scrollTo('The database'); await e.waitForTimeout(800);
  check((await crumb()) === 'The database' && await drawingSplit() === 6, 'scrolling (no click): breadcrumb and drawing follow the split in view');
  check((await cursorSplit()) !== 'The database', 'the cursor is still in another split');
  const host = await e.locator('.canvas-host').boundingBox();
  await e.mouse.click(host.x + host.width - 40, host.y + host.height - 80); await e.waitForTimeout(500);
  check((await cursorSplit()) === 'The database', 'starting to draw moves the cursor into the split you see');

  await e.locator('.editor-text .fullscreen-btn').click(); await e.waitForTimeout(1200);
  check(await e.locator('.editor-toc .contents-split').count() === 9, 'full-screen writing shows the Article-view "Splits" sidebar');
  await shot(e, 'fullscreen');
  await e.locator('.editor-toc .contents-split', { hasText: 'Archiving safely' }).click(); await e.waitForTimeout(1200);
  check(atTop(await topOf('Archiving safely')), 'sidebar → a split: heading at the top');
  await scrollTo('When things go wrong'); await e.waitForTimeout(800);
  check((await e.locator('.editor-toc .contents-split.is-on').innerText()).includes('When things go wrong'), 'scrolling in full screen moves the sidebar highlight');
  await e.locator('.editor-text .fullscreen-btn').click(); await e.waitForTimeout(1500);
  check(await drawingSplit() === 8 && (await crumb()) === 'When things go wrong', 'leaving full screen: the drawing shows the split you were reading');

  const toggle = e.locator('.slide-pane button', { hasText: 'Splits' }).first();
  await clickAt(e, toggle, 0.2); await e.waitForTimeout(600);
  const thumb = e.locator('.slide-thumb').nth(3); const tb = await thumb.boundingBox();
  await e.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await e.waitForTimeout(700);
  check((await e.locator('.slide-peek .slide-peek-label').innerText().catch(() => '')).includes('Kafka'), 'hovering a split shows a preview of its drawing');
  await e.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await e.waitForTimeout(1200);
  const kTop = await topOf('Kafka'), kCrumb = await crumb(), peeks = await e.locator('.slide-peek').count();
  check(atTop(kTop) && kCrumb.startsWith('Kafka') && peeks === 0,
    `clicking it brings its heading to the top of the editor, preview closes (top ${kTop}px, breadcrumb "${kCrumb}", previews ${peeks})`);

  // Pinned split panel in a narrower window (the list scrolls): it keeps the current split's thumbnail in view.
  const n = await page({ width: 1000, height: 800 });
  await signIn(n);
  await n.goto(BASE + '/write/' + IDS['telemetry-etl-pipeline']); await n.waitForTimeout(5000);
  await clickAt(n, n.locator('.slide-pane button', { hasText: 'Splits' }).first(), 0.2); await n.waitForTimeout(500);
  await n.locator('.strip-pin').click(); await n.waitForTimeout(500);
  const thumbInView = () => n.evaluate(() => { const l = document.querySelector('.slide-strip ol'); const t = l?.querySelector('[aria-current="true"]'); if (!l || !t) return 'no strip'; const a = l.getBoundingClientRect(), b = t.getBoundingClientRect(); return { overflows: l.scrollWidth > l.clientWidth, inView: b.left >= a.left - 1 && b.right <= a.right + 1 }; });
  for (const target of ['Decisions and trade-offs', 'The problem']) {
    await n.locator('.editor-crumbs .crumb-split').click(); await n.waitForTimeout(300);
    await n.locator('.menu-panel .contents-split', { hasText: target }).click(); await n.waitForTimeout(1300);
    const t = await thumbInView();
    check(t.overflows && t.inView, `pinned panel, jump to "${target}": its thumbnail scrolls into view (${JSON.stringify(t)})`);
  }

  // sub-sections + flash (Consistent Hashing has H3 sub-sections)
  const c = await page();
  await signIn(c);
  await c.goto(BASE + '/write/' + IDS['consistent-hashing']); await c.waitForTimeout(6000);
  await c.locator('.editor-crumbs .crumb-split').click(); await c.waitForTimeout(300);
  const want = (await c.locator('.menu-panel .contents-sub').allInnerTexts())[1];
  await c.locator('.menu-panel .contents-sub', { hasText: want }).click(); await c.waitForTimeout(850);
  const flash = await c.evaluate(w => { const f = document.querySelector('.editor-scroll > .jump-flash'); if (!f) return 'none'; const fr = f.getBoundingClientRect(); const h = [...document.querySelectorAll('.prose-edit > h3')].find(x => x.textContent.trim() === w).getBoundingClientRect(); return Math.abs(fr.top - h.top) < 2 && Math.abs(fr.height - h.height) < 2 ? 'on it' : 'misplaced'; }, want);
  const top = await c.evaluate(w => { const sc = document.querySelector('.editor-scroll').getBoundingClientRect().top; const h = [...document.querySelectorAll('.prose-edit > h3')].find(x => x.textContent.trim() === w); return Math.round(h.getBoundingClientRect().top - sc); }, want);
  check(atTop(top), `Contents → sub-section "${want}" comes to the top`);
  check(flash === 'on it', `the jumped-to heading flashes (${flash})`);
  await c.waitForTimeout(1500);
  check(await c.locator('.editor-scroll > .jump-flash').count() === 0, 'the flash goes away');
});
