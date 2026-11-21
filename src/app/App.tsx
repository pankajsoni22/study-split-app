import { Routes } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary.tsx';
import { routeTable } from './routes.tsx';

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <ErrorBoundary>
        <Routes>{routeTable}</Routes>
      </ErrorBoundary>
    </>
  );
}
