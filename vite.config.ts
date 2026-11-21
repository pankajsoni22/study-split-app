import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Content-Security-Policy for production. GitHub Pages can't send headers, so it ships as a <meta> tag.
 * Allows only: this site, Google Identity Services (sign-in), and our Supabase project (API, realtime, storage).
 * Dev mode is skipped because Vite's dev server injects inline scripts.
 */
function contentSecurityPolicy(supabaseUrl: string): Plugin {
  const supabase = supabaseUrl ? new URL(supabaseUrl).origin : '';
  const supabaseWs = supabase.replace(/^https:/, 'wss:');
  const csp = [
    "default-src 'self'",
    // 'wasm-unsafe-eval': Excalidraw compiles its font-subsetting WebAssembly (no JS eval is allowed).
    "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com/gsi/client",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    `connect-src 'self' ${supabase} ${supabaseWs} https://accounts.google.com/gsi/`,
    'frame-src https://accounts.google.com/gsi/',
    `img-src 'self' data: blob: ${supabase} https://*.googleusercontent.com https://*.gstatic.com`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }]
  };
}

/**
 * GitHub Pages has no server-side routing. Serving the app shell as 404.html makes deep links such as
 * /study-split-app/pankaj/my-article load the SPA, which then routes on the client.
 */
function spaFallback(): Plugin {
  let outDir = 'dist';
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    async closeBundle() { await copyFile(resolve(outDir, 'index.html'), resolve(outDir, '404.html')); }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: env.VITE_BASE_PATH || '/study-split-app/',
    plugins: [react(), contentSecurityPolicy(env.VITE_SUPABASE_URL ?? ''), spaFallback()],
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: {
      rollupOptions: {
        output: {
          // Long-lived vendor chunks: app deploys don't invalidate them in readers' caches.
          manualChunks(id: string) {
            if (id.includes('node_modules/@supabase')) return 'supabase';
            if (/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)) return 'react';
            return undefined;
          }
        }
      }
    },
    test: { include: ['src/**/*.test.ts'], environment: 'node' }
  };
});
