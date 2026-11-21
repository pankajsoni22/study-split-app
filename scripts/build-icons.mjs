// Renders the PNG app icons from public/favicon.svg. Run after changing the logo: npm run icons
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url));
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname;

for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  await sharp(svg, { density: 72 * size / 64 * 2 }).resize(size, size).png().toFile(out(name));
}
// Maskable icon: the mark sits inside the 80% safe zone on a full-bleed Verdigris background.
const inner = await sharp(svg, { density: 1200 }).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0E7C6B' } })
  .composite([{ input: inner, gravity: 'center' }]).png().toFile(out('icon-maskable-512.png'));
console.log('Icons written to public/');
