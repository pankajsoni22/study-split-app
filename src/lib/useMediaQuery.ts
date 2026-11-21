import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    cb => { const m = matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => matchMedia(query).matches,
    () => false
  );
}

/** Below 768 px the app is read-only (decision D9). */
export const useIsNarrow = () => useMediaQuery('(max-width: 767.98px)');
