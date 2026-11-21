import { useCallback, useEffect, useRef, useState } from 'react';
import type { Services } from './ports.ts';
import { getServices } from './services.ts';

// Same small hook as soni-siblings-app (src/api/useQuery.ts), reading through the data ports.

export interface QueryState<T> {
  /** Latest loaded data. Kept while a reload is in flight, so screens don't flash empty. */
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/** Last answer per key, so revisiting a screen shows it at once while it reloads. Memory only. */
const lastAnswer = new Map<string, unknown>();

/** Forget cached answers whose key starts with `prefix` (call after a write that changes them). */
export function invalidate(prefix: string): void {
  for (const key of lastAnswer.keys()) if (key.startsWith(prefix)) lastAnswer.delete(key);
}

/**
 * Loads data when `key` changes (or `reload()` is called) and ignores answers that arrive after
 * a newer request started. `key` must capture every input of `load`.
 *
 *   const { data, error, loading } = useQuery('articles:public', s => s.articles.listPublic());
 */
export function useQuery<T>(key: string, load: (services: Services) => Promise<T>): QueryState<T> {
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  const [nonce, setNonce] = useState(0);
  const requestKey = `${key}#${nonce}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: Error }>({ key: '' });

  useEffect(() => {
    let current = true;
    loadRef.current(getServices()).then(
      data => { if (current) { lastAnswer.set(key, data); setResult({ key: requestKey, data }); } },
      (err: unknown) => {
        if (current) setResult(prev => ({ key: requestKey, data: prev.data, error: err instanceof Error ? err : new Error(String(err)) }));
      }
    );
    return () => { current = false; };
  }, [key, requestKey]);

  const reload = useCallback(() => setNonce(n => n + 1), []);
  const loading = result.key !== requestKey;
  // Only reuse data that belongs to this key (a reload of the same key keeps showing the old answer).
  const sameKey = result.key.slice(0, result.key.lastIndexOf('#')) === key;
  const data = (sameKey ? result.data : undefined) ?? (lastAnswer.get(key) as T | undefined);
  return { data, error: loading ? undefined : result.error, loading, reload };
}
