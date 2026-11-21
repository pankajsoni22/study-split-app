import { useEffect, useRef } from 'react';
import { getGsi } from './gsi.ts';
import { useAuth } from './useAuth.ts';

/** Google's own "Sign in with Google" button (required by Google's branding rules). */
export default function GoogleSignInButton() {
  const ref = useRef<HTMLDivElement>(null);
  const { gsiReady } = useAuth();
  useEffect(() => {
    const gsi = getGsi();
    if (gsiReady && gsi && ref.current) {
      const dark = document.documentElement.dataset.theme === 'dark'
        || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      gsi.renderButton(ref.current, { type: 'standard', theme: dark ? 'filled_black' : 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 280 });
    }
  }, [gsiReady]);
  return <div ref={ref} className="signin-button" />;
}
