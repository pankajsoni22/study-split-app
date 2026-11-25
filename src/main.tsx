import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App.tsx';
import SetupNeededPage from './app/SetupNeededPage.tsx';
import { devBackend, missingConfig } from './config.ts';
import DevBadge from './dev/DevBadge.tsx';
import { AuthProvider } from './features/auth/AuthProvider.tsx';
import '@fontsource-variable/inter';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Refuse to run inside another site's frame (clickjacking). GitHub Pages can't send X-Frame-Options.
if (window.top !== window.self) {
  root.textContent = 'Study Split cannot be shown inside another page. Open it directly.';
  throw new Error('Refusing to run in a frame');
}

// BrowserRouter (clean URLs like /study-split-app/pankaj/my-article — shareable, GitHub-style).
// GitHub Pages serves the app shell for unknown paths via 404.html (see vite.config.ts).
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

createRoot(root).render(
  <StrictMode>
    {missingConfig.length > 0 ? <SetupNeededPage missing={missingConfig} /> : (
      <BrowserRouter basename={basename}>
        <AuthProvider>
          <App />
        </AuthProvider>
        {devBackend && <DevBadge backend={devBackend} />}
      </BrowserRouter>
    )}
  </StrictMode>
);
