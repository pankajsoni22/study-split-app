import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../ui/States.tsx';

export default function NotFoundPage() {
  return (
    <EmptyState icon={Compass} title="Page not found">
      <h1 className="visually-hidden">Page not found</h1>
      <p className="muted">The link may be old, or the article may be private.</p>
      <Link className="btn btn-ghost" to="/">Go home</Link>
    </EmptyState>
  );
}
