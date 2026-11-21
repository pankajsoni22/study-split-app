import { readJson, writeJson } from './storage.ts';

// FR-24: count one view per browser per article per 24 h. The last-seen map is pruned so it stays small.
const KEY = 'ss.views';
const DAY = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

/** True (and remembers it) if this article's view should be sent to the server now. */
export function shouldRecordView(articleId: string, now = Date.now()): boolean {
  const seen = readJson<Record<string, number>>(KEY, {});
  const last = seen[articleId];
  if (last !== undefined && now - last < DAY) return false;

  seen[articleId] = now;
  const fresh = Object.entries(seen).filter(([, t]) => now - t < DAY).sort((a, b) => b[1] - a[1]).slice(0, MAX_ENTRIES);
  writeJson(KEY, Object.fromEntries(fresh));
  return true;
}
