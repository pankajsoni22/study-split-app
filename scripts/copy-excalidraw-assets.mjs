// Copies Excalidraw's fonts into public/excalidraw/ so they are served from our own origin.
// (Excalidraw otherwise fetches them from a CDN, which the Content-Security-Policy blocks.)
// Runs automatically after `npm install` / `npm ci`. The output folder is git-ignored.
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const src = new URL('../node_modules/@excalidraw/excalidraw/dist/prod/fonts/', import.meta.url);
const dest = new URL('../public/excalidraw/fonts/', import.meta.url);
if (!existsSync(src)) {
  console.log('copy-excalidraw-assets: Excalidraw not installed, skipping');
} else {
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true });
  console.log('copy-excalidraw-assets: fonts copied to public/excalidraw/fonts');
}
