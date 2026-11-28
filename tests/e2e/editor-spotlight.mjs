// Editor Unfold spotlight: the cursor's paragraph makes its drawing parts glow (the rest fades); a paragraph without
// parts shows nothing; clicking a drawing part lights up its paragraph; it changes nothing in the article.
// Sample: consistent-hashing (Unfold on).
import { BASE, IDS, check, run } from './lib.mjs';

await run('editor-spotlight', async ({ page, signIn, shot }) => {
  const e = await page();
  await signIn(e);
  await e.goto(BASE + '/write/' + IDS['consistent-hashing']); await e.waitForTimeout(6000);
  const glows = () => e.locator('.unfold-spotlight .unfold-glow').count();
  const clickPara = async loc => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); await e.mouse.click(b.x + 30, b.y + 8); await e.waitForTimeout(700); };

  check(await e.locator('.prose-edit .unfold-has').count() > 5, 'paragraphs with drawing parts show step badges');
  const a = e.locator('.prose-edit .unfold-has').nth(0), b = e.locator('.prose-edit .unfold-has').nth(1);
  await clickPara(a);
  const first = await e.locator('.unfold-spotlight').evaluate(el => [...el.querySelectorAll('.unfold-glow')].map(g => ['x', 'y', 'width', 'height'].map(k => g.getAttribute(k)).join(':')).join()).catch(() => '');
  check(await glows() > 0 && await e.locator('.unfold-spotlight .unfold-veil').count() === 1, 'cursor in a paragraph: its drawing parts glow, the rest fades');
  await shot(e, 'write');
  await clickPara(b);
  const second = await e.locator('.unfold-spotlight').evaluate(el => [...el.querySelectorAll('.unfold-glow')].map(g => ['x', 'y', 'width', 'height'].map(k => g.getAttribute(k)).join(':')).join()).catch(() => '');
  check(second && second !== first, 'the next step\'s paragraph moves the spotlight');
  await clickPara(e.locator('.prose-edit > p:not(.unfold-has)').first());
  check(await e.locator('.unfold-spotlight').count() === 0, 'a paragraph without drawing parts: nothing highlighted');

  await clickPara(b);
  const want = await b.getAttribute('data-block-id');
  const g = await e.locator('.unfold-spotlight .unfold-glow').first().boundingBox();
  await e.mouse.click(g.x + 4, g.y + g.height / 2); await e.waitForTimeout(500);
  let linked = await e.locator('.prose-edit .unfold-linked').getAttribute('data-block-id').catch(() => null);
  if (!linked) { await e.mouse.click(g.x + g.width / 2, g.y + g.height / 2); await e.waitForTimeout(500); linked = await e.locator('.prose-edit .unfold-linked').getAttribute('data-block-id').catch(() => null); }
  check(linked === want, 'clicking a drawing part lights up its paragraph in the text');
  check(await e.locator('.unfold-spotlight .unfold-veil').count() === 0 && await glows() > 0, 'while drawing: no fade, the part\'s step still glows');
  const host = await e.locator('.canvas-host').boundingBox();
  await e.mouse.click(host.x + host.width - 30, host.y + host.height - 60); await e.waitForTimeout(500);
  check(await e.locator('.prose-edit .unfold-linked').count() === 0, 'clicking empty canvas clears it');
  check(!/unsaved/i.test(await e.locator('.bar-meta').innerText()), 'highlighting changes nothing in the article');
});
