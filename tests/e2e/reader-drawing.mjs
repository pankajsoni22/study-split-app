// Reader, Unfold drawings stay steady while stepping: parts already shown never vanish, no visible text waits on a
// font, and stepping loads no fonts at all (one font set per split). Sample: dev-writer/telemetry-etl-pipeline.
import { BASE, check, openFresh, run } from './lib.mjs';

await run('reader-drawing', async ({ page, shot }) => {
  const r = await page({ width: 1600, height: 1000 });
  await openFresh(r, BASE + '/dev-writer/telemetry-etl-pipeline#split-2-the-big-picture');
  await r.evaluate(() => {
    Object.assign(window, { __bad: 0, __dips: 0, __fontLoads: 0, __run: true, __forward: true });
    document.fonts.addEventListener('loading', () => window.__fontLoads++);
    const visible = () => [...document.querySelectorAll('.slide-image.is-stage svg')].filter(s => !s.closest('.is-pending'));
    const shapes = () => visible().reduce((n, s) => n + s.querySelectorAll('path, text').length, 0);
    let floor = shapes();
    window.__step = () => { floor = shapes(); };
    const tick = () => {
      for (const svg of visible()) {
        const fams = [...(svg.querySelector('style')?.textContent ?? '').matchAll(/font-family:\s*"?([^";]+)"?;/g)].map(m => m[1]);
        if (fams.some(f => [...document.fonts].some(face => face.family.replace(/["']/g, '') === f && face.status !== 'loaded'))) { window.__bad++; break; }
      }
      if (window.__forward && shapes() < floor) window.__dips++;
      if (window.__run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const counts = [];
  for (let i = 0; i < 6; i++) {
    await r.evaluate(() => window.__step());
    await r.keyboard.press('ArrowDown'); await r.waitForTimeout(900);
    counts.push(await r.evaluate(() => document.querySelectorAll('.slide-image.is-stage svg path, .slide-image.is-stage svg text').length));
  }
  await r.evaluate(() => { window.__forward = false; });
  for (let i = 0; i < 4; i++) { await r.keyboard.press('ArrowUp'); await r.waitForTimeout(700); }
  const res = await r.evaluate(() => { window.__run = false; return { bad: window.__bad, dips: window.__dips, loads: window.__fontLoads }; });
  check(counts.every((c, i) => i === 0 || c >= counts[i - 1]), `the drawing grows step by step: ${counts.join(' → ')} shapes`);
  check(res.dips === 0, `parts already shown never vanish while stepping forward (${res.dips} frames)`);
  check(res.bad === 0, `no visible drawing text waits on a font (${res.bad} frames)`);
  check(res.loads === 0, `stepping forward and back loads no fonts (${res.loads} loads)`);
  check(await r.locator('.slide-image.is-stage .slide-image-frame').count() === 1, 'old pictures are removed (one left)');
  const t = await r.evaluate(() => { const el = document.querySelector('.slide-image.is-stage .slide-image-svg text'); const fam = el.getAttribute('font-family').split(',')[0]; return { fam, ready: document.fonts.check('20px ' + fam) }; });
  check(t.ready && /Excalifont/.test(t.fam), `drawing text uses the split's hand-drawn font (${t.fam})`);
  await shot(r, 'mid-step');
});
