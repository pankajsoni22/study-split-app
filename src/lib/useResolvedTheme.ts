import { useSyncExternalStore } from 'react';

/** 'light' | 'dark' as actually shown (user choice, else system). Updates live. */
export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, read, () => 'light');
}

function read(): 'light' | 'dark' {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribe(cb: () => void) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => { mq.removeEventListener('change', cb); mo.disconnect(); };
}
