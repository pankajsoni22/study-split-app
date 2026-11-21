import { beforeEach, describe, expect, it } from 'vitest';
import { shouldRecordView } from './viewCounter.ts';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); }
  } as Storage;
});

describe('shouldRecordView', () => {
  it('records the first view, then waits 24 hours', () => {
    const t0 = 1_000_000;
    expect(shouldRecordView('a', t0)).toBe(true);
    expect(shouldRecordView('a', t0 + 60_000)).toBe(false);
    expect(shouldRecordView('a', t0 + 24 * 3600_000)).toBe(true);
  });
  it('tracks articles separately', () => {
    expect(shouldRecordView('a', 5)).toBe(true);
    expect(shouldRecordView('b', 6)).toBe(true);
  });
});
