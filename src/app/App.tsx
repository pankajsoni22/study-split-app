import { lazy, Suspense, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import RequireAuth from '../features/auth/RequireAuth.tsx';
import SignInPage from '../features/auth/SignInPage.tsx';
import UsernameOnboardingPage from '../features/auth/UsernameOnboardingPage.tsx';
import { useAuth } from '../features/auth/useAuth.ts';
import HomePage from '../features/home/HomePage.tsx';
import { Loading } from '../ui/States.tsx';
import ErrorBoundary from './ErrorBoundary.tsx';
import NotFoundPage from './NotFoundPage.tsx';
import { MobileTop, TabBar } from './shell/MobileNav.tsx';
import Sidebar from './shell/Sidebar.tsx';
import { useFocusOnNavigate } from './useFocusOnNavigate.ts';

// Everything except the landing page loads on demand, keeping the first download small (NFR-01).
const SettingsPage = lazy(() => import('../features/account/SettingsPage.tsx'));
const MyArticlesPage = lazy(() => import('../features/articles/MyArticlesPage.tsx'));
const ProfilePage = lazy(() => import('../features/articles/ProfilePage.tsx'));
const WritePage = lazy(() => import('../features/editor/WritePage.tsx'));
const AdminUsersPage = lazy(() => import('../features/admin/AdminUsersPage.tsx'));
const AdminSettingsPage = lazy(() => import('../features/admin/AdminSettingsPage.tsx'));

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <ErrorBoundary>
        <Routes>
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/onboarding/username" element={<RequireAuth><UsernameOnboardingPage /></RequireAuth>} />
          <Route path="*" element={<Shell />} />
        </Routes>
      </ErrorBoundary>
    </>
  );
}

function Shell() {
  const mainRef = useRef<HTMLElement>(null);
  const { profile } = useAuth();
  const location = useLocation();
  useFocusOnNavigate(mainRef);

  // New users must accept or change their suggested username before anything else (idea #10).
  if (profile && !profile.usernameConfirmed) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/onboarding/username?next=${next}`} replace />;
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="app-main">
        <MobileTop />
        <main id="main" ref={mainRef}>
          <ErrorBoundary>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
                <Route path="/me/articles" element={<RequireAuth need="write"><MyArticlesPage /></RequireAuth>} />
                <Route path="/write/:articleId" element={<RequireAuth need="write"><WritePage /></RequireAuth>} />
                <Route path="/admin/users" element={<RequireAuth need="admin"><AdminUsersPage /></RequireAuth>} />
                <Route path="/admin/settings" element={<RequireAuth need="admin"><AdminSettingsPage /></RequireAuth>} />
                <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
                <Route path="/:username" element={<ProfilePage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <TabBar />
    </div>
  );
}
