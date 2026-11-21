import { useCallback, useState } from 'react';
import { readJson, writeJson } from './storage.ts';

/** Split ratio remembered per screen (docs §7): falls back to the global default, then 50/50. */
export function useStoredRatio(key: string): [number, (r: number) => void] {
  const [ratio, setRatio] = useState<number>(() => readJson<number | null>(`ss.ratio.${key}`, null) ?? readJson<number>('ss.ratio.default', 0.5));
  const update = useCallback((r: number) => {
    setRatio(r);
    writeJson(`ss.ratio.${key}`, r);
    writeJson('ss.ratio.default', r);
  }, [key]);
  return [ratio, update];
}
