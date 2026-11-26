import { BookOpenText, Columns2, PenTool, Repeat } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { devQuickSignIn } from '../../config.ts';
import DevQuickSignIn from '../../dev/DevQuickSignIn.tsx';
import Brand from '../../ui/Brand.tsx';
import GoogleSignInButton from './GoogleSignInButton.tsx';
import { useAuth } from './useAuth.ts';

/** Only accepts in-app paths for ?next= (no open redirects). */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/** Full-screen sign-in: a brand panel on computers, a centred card on phones (as in soni-siblings-app). */
export default function SignInPage() {
  const { status, error, promptOneTap } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  useEffect(() => { promptOneTap(); }, [promptOneTap]);

  if (status === 'signedIn') return <Navigate to={next} replace />;

  return (
    <div className="auth">
      <section className="auth-panel" aria-hidden="true">
        <Brand to={null} />
        <div>
          <p className="auth-headline">Write it on the left. Draw it on the right.</p>
          <ul className="auth-points">
            <li><Columns2 size={20} /> Text and diagrams side by side, scrolling together</li>
            <li><PenTool size={20} /> Hand-drawn canvas for every system design</li>
            <li><Repeat size={20} /> Present mode: walk through one split at a time</li>
            <li><BookOpenText size={20} /> Publish under your own @username</li>
          </ul>
        </div>
        <p className="auth-foot">Free to read. Sign in to write and keep your notes.</p>
      </section>
      <main id="main" className="auth-main">
        <div className="auth-card">
          <Brand to={null} />
          <div>
            <h1>Welcome to Study Split</h1>
            <p className="muted">Sign in with your Google account to continue.</p>
          </div>
          {status === 'signingIn'
            ? <div className="spinner" role="status" aria-label="Signing in" />
            : <GoogleSignInButton />}
          {error && <p className="error-text" role="alert">{error}</p>}
          {devQuickSignIn && status !== 'signingIn' && <DevQuickSignIn />}
          <Link to="/" className="auth-back">← Keep reading without signing in</Link>
        </div>
      </main>
    </div>
  );
}
