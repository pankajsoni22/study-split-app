// Reader, Split view with Unfold: the reading pointer, collapsibles, split buttons, going back, resume after refresh,
// split links and Copy link. Sample: dev-writer/consistent-hashing.
import { BASE, check, clickAt, openFresh, run } from './lib.mjs';

const URL = BASE + '/dev-writer/consistent-hashing';

await run('reader', async ({ page }) => {
  const r = await page({ width: 1600, height: 950 });
  const st = () => r.evaluate(() => {
    const root = document.querySelector('.reader-scroll');
    const paras = [...root.querySelectorAll('.ProseMirror > [data-block-id], .ProseMirror > .tableWrapper')].filter(el => (el.textContent || '').trim() !== '');
    const c = root.querySelector('.is-unfold-current');
    return { title: root.querySelector('h2')?.textContent, at: paras.indexOf(c), last: paras.length - 1, cls: c?.className ?? '',
      open: !!c?.classList.contains('is-open'), crumb: document.querySelector('.crumb-title')?.textContent, hash: location.hash };
  });
  const press = async (key, n = 1, wait = 400) => { for (let i = 0; i < n; i++) { await r.keyboard.press(key); await r.waitForTimeout(wait); } };
  const stepUntil = async (re, max = 40) => { let s = await st(); for (let i = 0; !re.test(s.cls) && i < max; i++) { await press('ArrowDown', 1, 350); s = await st(); } return s; };

  await openFresh(r, URL);
  let s = await st();
  check(s.at === 0 && s.hash === '#split-1-why-naive-hashing-breaks' && s.crumb === 'Why naive hashing breaks',
    'opens on split 1 with the pointer on its first paragraph; address bar and breadcrumb name the split');
  await press('ArrowDown', 1, 450);
  check((await st()).at === 1, '↓ moves the pointer one paragraph');

  s = await stepUntil(/collapsible|details/);
  await press('Enter', 1, 1100); s = await st();
  check(/collapsible|details/.test(s.cls) && s.open, 'Enter opens a collapsible and the pointer stays on it');
  await press('Enter', 1, 900);
  check(!(await st()).open, 'Enter closes it again');

  await stepUntil(/next-split-cta/);
  await press('ArrowDown', 3);
  check(/next-split-cta/.test((await st()).cls), '↓ reaches the Next split card and further ↓ keeps it there');
  await press('ArrowUp', 1, 500);
  check(!/next-split-cta/.test((await st()).cls), '↑ steps back to the last paragraph');
  await press('ArrowDown', 1, 500);
  await press('Enter', 1, 1000); s = await st();
  check(s.title === 'The hash ring' && s.at === 0 && s.hash.startsWith('#split-2-'), 'Enter on Next opens split 2 at its first paragraph; the link follows');

  await press('ArrowUp', 1, 400);
  check(/prev-split/.test((await st()).cls), '↑ from the first paragraph lands on "‹ previous"');
  await press('Enter', 1, 1200); s = await st();
  check(s.title === 'Why naive hashing breaks' && s.at === s.last, 'going back opens the previous split at its end (pointer on its last paragraph)');
  await press('[', 0); await press(']', 1, 800); await press('[', 1, 1200); s = await st();
  check(s.title === 'Why naive hashing breaks' && s.at === s.last, '[ also opens the previous split at its end');

  await press('ArrowUp', 2, 500); await r.waitForTimeout(900);
  const before = await st(); await r.reload(); await r.waitForTimeout(3500); const after = await st();
  check(after.title === before.title && after.at === before.at, `a refresh resumes on the same paragraph (${before.at} → ${after.at})`);

  await r.locator('.split-top .copy-split-link').scrollIntoViewIfNeeded(); await r.waitForTimeout(400);   // a reader scrolls up to it
  await clickAt(r, r.locator('.split-top .copy-split-link'), 0.3); await r.waitForTimeout(400);
  const clip = await r.evaluate(() => navigator.clipboard.readText());
  check(clip.endsWith('/dev-writer/consistent-hashing#split-1-why-naive-hashing-breaks'), 'Copy link copies a link to this split');

  const other = await page({ width: 1600, height: 950 });
  await other.goto(URL + '#split-5-virtual-nodes'); await other.waitForTimeout(3500);
  check((await other.locator('.reader-scroll h2').first().innerText()) === 'Virtual nodes', 'opening a split link (fresh browser) shows that split');

  await r.locator('.crumb-split').click(); await r.waitForTimeout(300);
  await r.locator('.menu-panel .contents-split', { hasText: 'Replication' }).click(); await r.waitForTimeout(900);
  check((await st()).title === 'Replication', 'breadcrumb → Contents jumps to a split');
});
