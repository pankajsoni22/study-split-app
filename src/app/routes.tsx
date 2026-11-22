/* eslint-disable react-refresh/only-export-components -- route table + its layout components live together */
import { lazy, Suspense, useRef, type ReactNode } from 'react';
import { Navigate, Outlet, Route, useLocation } from 'react-router-dom';
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
const TrashPage = lazy(() => import('../features/articles/TrashPage.tsx'));
const ProfilePage = lazy(() => import('../features/articles/ProfilePage.tsx'));
const NewArticlePage = lazy(() => import('../features/editor/NewArticlePage.tsx'));
const AdminUsersPage = lazy(() => import('../features/admin/AdminUsersPage.tsx'));
const AdminSettingsPage = lazy(() => import('../features/admin/AdminSettingsPage.tsx'));
// Full-screen pages (no sidebar): the split editor and the reader.
const EditorRoute = lazy(() => import('../features/editor/EditorRoute.tsx'));
const ReaderPage = lazy(() => import('../features/reader/ReaderPage.tsx'));

/**
 * One flat route table with layout routes (<Outlet/>). React Router ranks ALL paths together, so
 * static paths (/me/articles, /admin/users, /write/new) always beat the patterns
 * (/:username/:slug, /write/:articleId, /:username).
 */
export const routeTable = (
  <>
  <Route path="/signin" element={<SignInPage />} />
  <Route path="/onboarding/username" element={<RequireAuth><UsernameOnboardingPage /></RequireAuth>} />

  <Route element={<UsernameGate />}>
    {/* Full-screen */}
    <Route path="/write/:articleId" element={<RequireAuth need="write"><Lazy><EditorRoute /></Lazy></RequireAuth>} />
    <Route path="/:username/:slug" element={<Lazy><ReaderPage /></Lazy>} />

    {/* Sidebar layout */}
    <Route element={<Shell />}>
      <Route path="/" element={<HomePage />} />
      <Route path="/write/new" element={<RequireAuth need="write"><NewArticlePage /></RequireAuth>} />
      <Route path="/me/articles" element={<RequireAuth need="write"><MyArticlesPage /></RequireAuth>} />
      <Route path="/me/trash" element={<RequireAuth need="write"><TrashPage /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
      <Route path="/admin/users" element={<RequireAuth need="admin"><AdminUsersPage /></RequireAuth>} />
      <Route path="/admin/settings" element={<RequireAuth need="admin"><AdminSettingsPage /></RequireAuth>} />
      <Route path="/:username" element={<ProfilePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Route>
  </>
);

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}

/** New users must accept or change their suggested username before anything else (idea #10). */
function UsernameGate() {
  const { profile } = useAuth();
  const location = useLocation();
  if (profile && !profile.usernameConfirmed) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/onboarding/username?next=${next}`} replace />;
  }
  return <Outlet />;
}

function Shell() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusOnNavigate(mainRef);
  return (
    <div className="app">
      <Sidebar />
      <div className="app-main">
        <MobileTop />
        <main id="main" ref={mainRef}>
          <ErrorBoundary>
            <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <TabBar />
    </div>
  );
}
