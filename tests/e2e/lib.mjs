// Shared helpers for the browser tests in tests/e2e (run them with `npm run test:e2e`; see docs/04 §14).
// Each test file is a plain Node script: it drives a real Chromium against the LOCAL dev server and the local
// Supabase sample data, prints ✓/✗ per check, and exits non-zero if any check failed.
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

/** Base URL of the dev server (set by scripts/e2e.mjs). */
export const BASE = process.env.E2E_BASE ?? 'http://localhost:5173/study-split-app';
/** Sample articles' short ids (as in /read/{id} and /write/{id}), by sample name (set by scripts/e2e.mjs). */
export const IDS = JSON.parse(process.env.E2E_IDS ?? '{}');
/** Where tests save screenshots (outside the repo). */
export const SHOTS = process.env.E2E_SHOTS ?? join(tmpdir(), 'study-split-e2e');
mkdirSync(SHOTS, { recursive: true });

/** A Chromium for playwright-core: $PW_CHROMIUM, or the newest one installed in the Playwright cache. */
export function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), '.cache', 'ms-playwright');
  const found = (existsSync(cache) ? readdirSync(cache) : [])
    .filter(d => /^chromium(_headless_shell)?-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()))
    .flatMap(d => [
      join(cache, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
      join(cache, d, 'chrome-linux64', 'chrome'),
      join(cache, d, 'chrome-linux', 'chrome'),
      join(cache, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      join(cache, d, 'chrome-win', 'chrome.exe')
    ])
    .find(existsSync);
  return found;
}

let failed = 0, passed = 0;
/** Records one check: prints ✓ or ✗ with the message. */
export function check(ok, message) {
  if (ok) passed++; else failed++;
  console.log(`${ok ? '✓' : '✗'} ${message}`);
}

/**
 * Runs a test body with a fresh browser; reports page errors and a summary, and sets the exit code.
 * `body(t)` gets { browser, page(opts), signIn(page, 'Writer'), shot(page, name, clip) }.
 */
export async function run(name, body) {
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const errors = [];
  const page = async ({ width = 1440, height = 900, scheme = 'light' } = {}) => {
    const p = await (await browser.newContext({ viewport: { width, height }, colorScheme: scheme, permissions: ['clipboard-read', 'clipboard-write'] })).newPage();
    p.setDefaultTimeout(15000);
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => d.accept());
    return p;
  };
  const signIn = async (p, who = 'Writer') => {
    await p.goto(BASE + '/signin'); await p.waitForTimeout(1200);
    await p.locator('.dev-signin button', { hasText: who }).click(); await p.waitForTimeout(2500);
  };
  const shot = (p, file, clip) => p.screenshot({ path: join(SHOTS, `${name}-${file}.png`), clip });
  try {
    await body({ browser, page, signIn, shot });
  } catch (e) {
    failed++;
    console.log(`✗ STOPPED: ${e.message.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
  if (errors.length) { failed++; console.log(`✗ page errors: ${errors.join(' | ')}`); }
  console.log(`${failed ? '✗' : '✓'} ${name}: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

// ---- small page helpers shared by several tests ----

/** A Layout / Mode bar menu by its label. */
export const barMenu = (p, label) => p.locator('.bar-menu', { has: p.locator('.bar-menu-label', { hasText: label }) });
/** Opens a bar menu and picks one of its radio choices. */
export async function pickInMenu(p, label, choice) {
  await barMenu(p, label).click();
  await p.locator('.menu-panel [role="menuitemradio"]', { hasText: choice }).first().click();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
}
/** Reader: turns Unfold on/off through the Mode menu. */
export async function toggleReaderUnfold(p) {
  await barMenu(p, 'Mode').click();
  await p.locator('.menu-panel .unfold-toggle').click();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
}
/** Opens a reader page with this browser's saved reading state cleared. */
export async function openFresh(p, url) {
  await p.goto(url); await p.waitForTimeout(800);
  await p.evaluate(() => localStorage.clear());
  await p.goto(url); await p.waitForTimeout(3500);
}
/** Clicks at the middle of an element like a person (no scrolling first). */
export async function clickAt(p, locator, dx = 0.5, dy = 0.5) {
  const b = await locator.boundingBox();
  await p.mouse.click(b.x + b.width * dx, b.y + b.height * dy);
}
