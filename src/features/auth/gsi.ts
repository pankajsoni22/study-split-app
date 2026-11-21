// Helpers around Google Identity Services (loaded by a <script> tag in index.html). Same as soni-siblings-app.

export type Gsi = typeof google.accounts.id;

/** The GSI API, or undefined while the script is still loading or was blocked. */
export function getGsi(): Gsi | undefined {
  return (window as Window & { google?: typeof google }).google?.accounts?.id;
}

export function waitForGsi(timeoutMs = 10_000): Promise<Gsi> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const gsi = getGsi();
      if (gsi) resolve(gsi);
      else if (Date.now() - started > timeoutMs) reject(new Error('Google sign-in did not load'));
      else window.setTimeout(check, 50);
    };
    check();
  });
}

/**
 * Nonce pair for replay protection: Google embeds sha256(raw) in the ID token, and Supabase checks it
 * against the raw value we send with the token.
 */
export async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return { raw, hashed };
}
