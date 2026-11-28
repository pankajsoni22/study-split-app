// The chosen theme survives a refresh, whatever the computer's own theme is (the early theme script must load).
import { BASE, check, run } from './lib.mjs';

await run('theme', async ({ page }) => {
  for (const system of ['dark', 'light']) {
    const p = await page({ scheme: system });
    for (const pick of ['Light', 'Dark', 'System']) {
      await p.goto(BASE + '/read/EtlPipeline1'); await p.waitForTimeout(2500);
      await p.locator('.reader-bar button[aria-label="Settings"]').click();
      await p.locator(`.menu-panel [aria-label="Theme"] button[title="${pick}"]`).click(); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      const bg = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const before = await bg();
      await p.reload(); await p.waitForTimeout(150);
      const early = await bg();
      await p.waitForTimeout(2000);
      const after = await bg();
      check(before === early && early === after, `computer ${system}, chose ${pick}: same colours before, right after and after a refresh`);
    }
  }
});
