import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';

/** After client-side navigation, move focus to the page heading so screen readers announce the new page. */
export function useFocusOnNavigate(mainRef: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const h1 = mainRef.current?.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }, [pathname, mainRef]);
}
