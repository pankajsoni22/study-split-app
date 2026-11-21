import { lazy, Suspense } from 'react';
import { useIsNarrow } from '../../lib/useMediaQuery.ts';
import { Loading } from '../../ui/States.tsx';
import WritePage from './WritePage.tsx';

const EditorPage = lazy(() => import('./EditorPage.tsx'));

/** Phones are read-only (D9); larger screens get the split editor (loaded on demand). */
export default function EditorRoute() {
  const narrow = useIsNarrow();
  if (narrow) return <main id="main"><WritePage /></main>;
  return <Suspense fallback={<Loading label="Opening editor" />}><EditorPage /></Suspense>;
}
